from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib import parse as urllib_parse

import requests

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from elections.models import ElectionCensusChangeEvent, ElectionCensusMember, ElectionCensusSync


class Command(BaseCommand):
    help = "Sincroniza censo electoral desde archivo JSON o URL HTTP (soporta dry-run y apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source-file",
            type=str,
            default="",
            help="Ruta a archivo JSON con lista de estudiantes del censo.",
        )
        parser.add_argument(
            "--source-url",
            type=str,
            default="",
            help="URL HTTP de la API institucional que retorna la lista JSON de censo.",
        )
        parser.add_argument(
            "--source-active-enrollments",
            action="store_true",
            help="Usa matrículas internas activas como fuente de censo (grados 1° a 11°).",
        )
        parser.add_argument(
            "--academic-year-id",
            type=int,
            default=None,
            help="Filtra matrículas por año académico. Si se omite, usa el año activo.",
        )
        parser.add_argument(
            "--auth-token",
            type=str,
            default="",
            help="Token Bearer para consumir source-url. Si no se indica, usa KAMPUS_CENSUS_SYNC_AUTH_TOKEN.",
        )
        parser.add_argument(
            "--extra-headers-json",
            type=str,
            default="",
            help="Headers HTTP adicionales en JSON (ej: '{\"X-Api-Key\":\"abc\"}').",
        )
        parser.add_argument(
            "--timeout-seconds",
            type=int,
            default=30,
            help="Timeout HTTP para source-url en segundos.",
        )
        parser.add_argument(
            "--source-name",
            type=str,
            default="institutional_api",
            help="Nombre lógico de la fuente de censo.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Aplica cambios en base de datos. Si no se indica, se ejecuta en dry-run.",
        )

    def handle(self, *args, **options):
        source_file_value = str(options["source_file"]).strip()
        source_url = str(options["source_url"]).strip() or os.getenv("KAMPUS_CENSUS_SYNC_URL", "").strip()
        source_file = Path(source_file_value) if source_file_value else None
        source_active_enrollments = bool(options.get("source_active_enrollments"))
        academic_year_id = options.get("academic_year_id")
        source_name = str(options["source_name"]).strip() or "institutional_api"
        if source_active_enrollments and not str(options["source_name"]).strip():
            source_name = "internal_enrollments"
        auth_token = str(options["auth_token"]).strip() or os.getenv("KAMPUS_CENSUS_SYNC_AUTH_TOKEN", "").strip()
        timeout_seconds = max(1, int(options.get("timeout_seconds") or 30))
        extra_headers_json = str(options.get("extra_headers_json") or "").strip()
        apply_changes = bool(options.get("apply"))
        mode = ElectionCensusSync.Mode.APPLY if apply_changes else ElectionCensusSync.Mode.DRY_RUN

        selected_sources = sum(
            [
                1 if source_file else 0,
                1 if source_url else 0,
                1 if source_active_enrollments else 0,
            ]
        )
        if selected_sources == 0:
            raise CommandError(
                "Debes indicar exactamente una fuente: --source-file, --source-url (o KAMPUS_CENSUS_SYNC_URL), "
                "o --source-active-enrollments."
            )
        if selected_sources > 1:
            raise CommandError("Solo puedes indicar una fuente por ejecución (archivo, URL o matrículas activas).")

        extra_headers: dict[str, str] = {}
        if extra_headers_json:
            try:
                parsed_headers = json.loads(extra_headers_json)
            except json.JSONDecodeError as exc:
                raise CommandError(f"extra-headers-json inválido: {exc}") from exc
            if not isinstance(parsed_headers, dict):
                raise CommandError("extra-headers-json debe ser un objeto JSON de headers.")
            extra_headers = {str(k): str(v) for k, v in parsed_headers.items()}

        source_reference: str
        if source_active_enrollments:
            payload, source_reference = self._load_from_active_enrollments(academic_year_id=academic_year_id)
        elif source_url:
            payload = self._load_from_url(
                source_url=source_url,
                auth_token=auth_token,
                extra_headers=extra_headers,
                timeout_seconds=timeout_seconds,
            )
            source_reference = source_url
        else:
            if source_file is None or not source_file.exists() or not source_file.is_file():
                raise CommandError(f"No se encontró el archivo fuente: {source_file}")
            payload = self._load_from_file(source_file)
            source_reference = str(source_file)

        if not isinstance(payload, list):
            raise CommandError("La fuente de censo debe contener una lista JSON de registros.")

        with transaction.atomic():
            sync = ElectionCensusSync.objects.create(
                source_name=source_name,
                mode=mode,
                status=ElectionCensusSync.Status.SUCCESS,
            )

            existing_members = {
                member.student_external_id: member
                for member in ElectionCensusMember.objects.all()
            }

            seen_external_ids: set[str] = set()
            created_count = 0
            updated_count = 0
            deactivated_count = 0
            unchanged_count = 0
            errors_count = 0

            for index, record in enumerate(payload, start=1):
                if not isinstance(record, dict):
                    errors_count += 1
                    continue

                normalized = self._normalize_record(record)
                external_id = normalized["student_external_id"]
                if not external_id:
                    errors_count += 1
                    continue

                seen_external_ids.add(external_id)
                current = existing_members.get(external_id)

                if current is None:
                    created_count += 1
                    if apply_changes:
                        member = ElectionCensusMember.objects.create(
                            student_external_id=external_id,
                            document_number=normalized["document_number"],
                            full_name=normalized["full_name"],
                            grade=normalized["grade"],
                            shift=normalized["shift"],
                            campus=normalized["campus"],
                            status=normalized["status"],
                            is_active=normalized["is_active"],
                            last_sync=sync,
                            metadata=normalized["metadata"],
                        )
                    else:
                        member = None

                    ElectionCensusChangeEvent.objects.create(
                        sync=sync,
                        member=member,
                        student_external_id=external_id,
                        change_type=ElectionCensusChangeEvent.ChangeType.CREATE,
                        before_payload={},
                        after_payload=normalized,
                    )
                    continue

                before = {
                    "document_number": current.document_number,
                    "full_name": current.full_name,
                    "grade": current.grade,
                    "shift": current.shift,
                    "campus": current.campus,
                    "status": current.status,
                    "is_active": current.is_active,
                    "metadata": current.metadata,
                }

                after = {
                    "document_number": normalized["document_number"],
                    "full_name": normalized["full_name"],
                    "grade": normalized["grade"],
                    "shift": normalized["shift"],
                    "campus": normalized["campus"],
                    "status": normalized["status"],
                    "is_active": normalized["is_active"],
                    "metadata": normalized["metadata"],
                }

                if before == after:
                    unchanged_count += 1
                    if apply_changes:
                        current.last_sync = sync
                        current.save(update_fields=["last_sync"])
                    continue

                updated_count += 1
                change_type = (
                    ElectionCensusChangeEvent.ChangeType.REACTIVATE
                    if (not current.is_active and normalized["is_active"])
                    else ElectionCensusChangeEvent.ChangeType.UPDATE
                )

                if apply_changes:
                    current.document_number = normalized["document_number"]
                    current.full_name = normalized["full_name"]
                    current.grade = normalized["grade"]
                    current.shift = normalized["shift"]
                    current.campus = normalized["campus"]
                    current.status = normalized["status"]
                    current.is_active = normalized["is_active"]
                    current.metadata = normalized["metadata"]
                    current.last_sync = sync
                    current.save()

                ElectionCensusChangeEvent.objects.create(
                    sync=sync,
                    member=current if apply_changes else None,
                    student_external_id=external_id,
                    change_type=change_type,
                    before_payload=before,
                    after_payload=after,
                )

            for external_id, member in existing_members.items():
                if external_id in seen_external_ids:
                    continue
                if not member.is_active and member.status == ElectionCensusMember.Status.INACTIVE:
                    continue

                deactivated_count += 1
                before = {
                    "document_number": member.document_number,
                    "full_name": member.full_name,
                    "grade": member.grade,
                    "shift": member.shift,
                    "campus": member.campus,
                    "status": member.status,
                    "is_active": member.is_active,
                    "metadata": member.metadata,
                }
                after = {
                    **before,
                    "status": ElectionCensusMember.Status.INACTIVE,
                    "is_active": False,
                }

                if apply_changes:
                    member.status = ElectionCensusMember.Status.INACTIVE
                    member.is_active = False
                    member.last_sync = sync
                    member.save(update_fields=["status", "is_active", "last_sync", "updated_at"])

                ElectionCensusChangeEvent.objects.create(
                    sync=sync,
                    member=member if apply_changes else None,
                    student_external_id=external_id,
                    change_type=ElectionCensusChangeEvent.ChangeType.DEACTIVATE,
                    before_payload=before,
                    after_payload=after,
                )

            if errors_count > 0 and (created_count + updated_count + deactivated_count) > 0:
                status = ElectionCensusSync.Status.PARTIAL
            elif errors_count > 0:
                status = ElectionCensusSync.Status.FAILED
            else:
                status = ElectionCensusSync.Status.SUCCESS

            sync.received_count = len(payload)
            sync.created_count = created_count
            sync.updated_count = updated_count
            sync.deactivated_count = deactivated_count
            sync.unchanged_count = unchanged_count
            sync.errors_count = errors_count
            sync.status = status
            sync.finished_at = timezone.now()
            sync.summary = {
                "source": source_reference,
                "processed_count": len(seen_external_ids),
                "mode": mode,
            }
            sync.save(
                update_fields=[
                    "received_count",
                    "created_count",
                    "updated_count",
                    "deactivated_count",
                    "unchanged_count",
                    "errors_count",
                    "status",
                    "finished_at",
                    "summary",
                ]
            )

        self.stdout.write(self.style.SUCCESS(f"Sincronización finalizada: id={sync.id} | modo={sync.mode} | estado={sync.status}"))
        self.stdout.write(
            "Resumen: "
            f"received={sync.received_count} created={sync.created_count} "
            f"updated={sync.updated_count} deactivated={sync.deactivated_count} "
            f"unchanged={sync.unchanged_count} errors={sync.errors_count}"
        )

    @staticmethod
    def _load_from_file(source_file: Path) -> list[dict[str, Any]]:
        try:
            payload = json.loads(source_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"JSON inválido en archivo fuente: {exc}") from exc
        if not isinstance(payload, list):
            raise CommandError("El archivo de censo debe contener una lista JSON de registros.")
        return payload

    @staticmethod
    def _load_from_url(
        *,
        source_url: str,
        auth_token: str,
        extra_headers: dict[str, str],
        timeout_seconds: int,
    ) -> list[dict[str, Any]]:
        parsed_url = urllib_parse.urlparse(source_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise CommandError("source-url inválida. Solo se permiten URLs HTTP/HTTPS absolutas.")

        headers = {
            "Accept": "application/json",
            **extra_headers,
        }
        if auth_token:
            headers.setdefault("Authorization", f"Bearer {auth_token}")

        try:
            response = requests.get(source_url, headers=headers, timeout=timeout_seconds)
            response.raise_for_status()
            raw = response.text
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else "desconocido"
            reason = exc.response.reason if exc.response is not None else str(exc)
            raise CommandError(f"Error HTTP consultando source-url ({status_code}): {reason}") from exc
        except requests.RequestException as exc:
            raise CommandError(f"No fue posible conectar con source-url: {exc}") from exc

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CommandError(f"JSON inválido recibido desde source-url: {exc}") from exc

        if not isinstance(payload, list):
            raise CommandError("La source-url debe retornar una lista JSON de registros.")
        return payload

    @staticmethod
    def _normalize_record(record: dict[str, Any]) -> dict[str, Any]:
        external_id = str(record.get("student_external_id") or record.get("external_id") or "").strip()
        status_raw = str(record.get("status") or "ACTIVE").strip().upper()
        source_is_active = status_raw in {"ACTIVE", "ENROLLED", "MATRICULADO"}
        grade_value = str(record.get("grade") or "").strip()
        parsed_grade = Command._normalize_grade_to_int(grade_value)
        grade_in_scope = parsed_grade is not None and 1 <= parsed_grade <= 11

        is_active = source_is_active and grade_in_scope
        status = ElectionCensusMember.Status.ACTIVE if is_active else ElectionCensusMember.Status.INACTIVE

        reserved_keys = {
            "student_external_id",
            "external_id",
            "document_number",
            "full_name",
            "name",
            "grade",
            "shift",
            "campus",
            "status",
        }

        metadata = {
            **{k: v for k, v in record.items() if k not in reserved_keys},
            "source_status": status_raw,
            "source_is_active": source_is_active,
            "grade_number": parsed_grade,
            "grade_in_scope_1_11": grade_in_scope,
        }

        return {
            "student_external_id": external_id,
            "document_number": str(record.get("document_number") or "").strip(),
            "full_name": str(record.get("full_name") or record.get("name") or "").strip(),
            "grade": grade_value,
            "shift": str(record.get("shift") or "").strip(),
            "campus": str(record.get("campus") or "").strip(),
            "status": status,
            "is_active": is_active,
            "metadata": metadata,
        }

    @staticmethod
    def _load_from_active_enrollments(*, academic_year_id: int | None) -> tuple[list[dict[str, Any]], str]:
        from academic.models import AcademicYear
        from students.models import Enrollment

        year = None
        if academic_year_id is not None:
            year = AcademicYear.objects.filter(id=academic_year_id).only("id", "year", "status").first()
            if year is None:
                raise CommandError(f"No existe AcademicYear con id={academic_year_id}.")
        else:
            year = (
                AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE)
                .order_by("-year", "-id")
                .only("id", "year", "status")
                .first()
            )
            if year is None:
                raise CommandError(
                    "No hay un año académico activo. Indica --academic-year-id para seleccionar la vigencia a sincronizar."
                )

        enrollments = (
            Enrollment.objects.select_related("student__user", "grade", "group", "campus", "group__campus")
            .filter(status="ACTIVE", academic_year_id=year.id)
            .order_by("id")
        )

        payload: list[dict[str, Any]] = []
        for enrollment in enrollments.iterator():
            grade_display = str(enrollment.grade.ordinal) if enrollment.grade.ordinal is not None else (enrollment.grade.name or "")
            campus_name = ""
            if enrollment.campus_id and enrollment.campus:
                campus_name = enrollment.campus.name or ""
            elif enrollment.group_id and enrollment.group and enrollment.group.campus_id and enrollment.group.campus:
                campus_name = enrollment.group.campus.name or ""

            student = enrollment.student
            user = student.user
            payload.append(
                {
                    "student_external_id": str(student.pk),
                    "document_number": (student.document_number or "").strip(),
                    "full_name": (user.get_full_name() or user.username or "").strip(),
                    "grade": grade_display,
                    "shift": enrollment.group.shift if enrollment.group_id and enrollment.group else "",
                    "campus": campus_name.strip(),
                    "status": "ACTIVE",
                    "source": "internal_enrollment",
                    "academic_year_id": year.id,
                    "academic_year": year.year,
                    "enrollment_id": enrollment.id,
                    "student_id": student.pk,
                }
            )

        return payload, f"internal_enrollments:academic_year_id={year.id}"

    @staticmethod
    def _normalize_grade_to_int(raw_grade: str) -> int | None:
        value = (raw_grade or "").strip().lower().replace("°", "")
        compact = value.replace(" ", "")
        mapping = {
            "primero": 1,
            "segundo": 2,
            "tercero": 3,
            "cuarto": 4,
            "quinto": 5,
            "sexto": 6,
            "septimo": 7,
            "octavo": 8,
            "noveno": 9,
            "decimo": 10,
            "once": 11,
            "undecimo": 11,
            "decimoprimero": 11,
        }

        if compact.isdigit():
            return int(compact)
        return mapping.get(compact)
