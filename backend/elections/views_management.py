from __future__ import annotations

import base64
import csv
import secrets
from datetime import timedelta
from io import BytesIO
from io import StringIO

from django.core.management import call_command
from django.db import transaction
from django.db.models import Q
from django.db.models import Count
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academic.models import AcademicYear
from students.models import Enrollment

from .models import (
    CandidatoContraloria,
    CandidatoPersoneria,
    ElectionCandidate,
    ElectionCensusMember,
    ElectionCensusSync,
    ElectionOpeningRecord,
    ElectionProcess,
    ElectionProcessCensusExclusion,
    ElectionRole,
    VoteRecord,
    VoterToken,
)
from .permissions import CanManageElectionSetup
from .serializers import (
    CandidatoContraloriaCreateSerializer,
    CandidatoPersoneriaCreateSerializer,
    ElectionCandidateManageSerializer,
    ElectionProcessCreateSerializer,
    ElectionProcessUpdateSerializer,
    ElectionProcessManageSerializer,
    ElectionOpeningRecordSerializer,
    ElectionRoleCreateSerializer,
    ElectionRoleManageSerializer,
    ElectionTokenEligibilityIssueSerializer,
    get_voter_token_census_eligibility_error,
)

try:
    import qrcode  # type: ignore
except Exception:
    qrcode = None


def _grade_value_for_enrollment(enrollment: Enrollment) -> int | None:
    if enrollment.grade.ordinal is not None:
        return enrollment.grade.ordinal

    raw_name = (enrollment.grade.name or "").strip().lower().replace("°", "")
    compact = raw_name.replace(" ", "")
    if compact.isdigit():
        return int(compact)

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
    return mapping.get(compact)


def _grade_value_from_text(raw_grade: str | None) -> int | None:
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


def _group_sort_value(group_name: str) -> tuple[int, str]:
    raw = (group_name or "").strip()
    if not raw:
        return (-1, "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return (int(digits), raw.upper())
    return (0, raw.upper())


def _qr_png_data_uri(text: str) -> str:
    if not qrcode:
        return ""
    image = qrcode.make(text)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_scrutiny_summary_payload(process: ElectionProcess) -> dict:
    roles = list(ElectionRole.objects.filter(process=process).order_by("display_order", "id"))
    role_summaries: list[dict] = []

    total_votes = 0
    total_blank_votes = 0

    for role in roles:
        candidate_rows = list(
            VoteRecord.objects.filter(process=process, role=role, candidate__isnull=False)
            .values("candidate_id", "candidate__name", "candidate__number")
            .annotate(votes=Count("id"))
            .order_by("-votes", "candidate__number", "candidate_id")
        )
        blank_votes = VoteRecord.objects.filter(process=process, role=role, is_blank=True).count()
        role_total_votes = sum(row["votes"] for row in candidate_rows) + blank_votes

        total_votes += role_total_votes
        total_blank_votes += blank_votes

        role_summaries.append(
            {
                "role_id": role.id,
                "code": role.code,
                "title": role.title,
                "total_votes": role_total_votes,
                "blank_votes": blank_votes,
                "candidates": [
                    {
                        "candidate_id": row["candidate_id"],
                        "name": row["candidate__name"],
                        "number": row["candidate__number"],
                        "votes": row["votes"],
                    }
                    for row in candidate_rows
                ],
            }
        )

    return {
        "process": {
            "id": process.id,
            "name": process.name,
            "status": process.status,
        },
        "summary": {
            "total_votes": total_votes,
            "total_blank_votes": total_blank_votes,
            "generated_at": timezone.now(),
        },
        "roles": role_summaries,
    }


class ElectionProcessListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        queryset = ElectionProcess.objects.annotate(votes_count=Count("votes", distinct=True)).order_by("-created_at", "-id")
        serializer = ElectionProcessManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = ElectionProcessCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionProcessManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ElectionProcessDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def patch(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ElectionProcessUpdateSerializer(instance=process, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        refreshed = ElectionProcess.objects.annotate(votes_count=Count("votes", distinct=True)).filter(id=process.id).first()
        return Response(ElectionProcessManageSerializer(refreshed).data)

    def delete(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        if VoteRecord.objects.filter(process_id=process.id).exists():
            return Response(
                {"detail": "No se puede eliminar la jornada porque ya tiene votos registrados."},
                status=status.HTTP_409_CONFLICT,
            )

        process.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionProcessOpenAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, process_id: int, *args, **kwargs):
        with transaction.atomic():
            process = ElectionProcess.objects.select_for_update().filter(id=process_id).first()
            if process is None:
                return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

            opening_record = ElectionOpeningRecord.objects.filter(process=process).first()
            votes_count = process.votes.count()
            blank_votes_count = process.votes.filter(is_blank=True).count()

            if opening_record is None:
                if votes_count > 0:
                    return Response(
                        {
                            "detail": "No se puede certificar apertura en cero porque ya existen votos registrados en la jornada.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )

                ElectionOpeningRecord.objects.create(
                    process=process,
                    opened_by=request.user,
                    votes_count_at_open=votes_count,
                    blank_votes_count_at_open=blank_votes_count,
                    metadata={"verified_zero": votes_count == 0},
                )

            process.status = ElectionProcess.Status.OPEN
            if process.starts_at is None:
                process.starts_at = timezone.now()
            process.save(update_fields=["status", "starts_at", "updated_at"])

        return Response(ElectionProcessManageSerializer(process).data)


class ElectionProcessOpeningRecordAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        opening_record = ElectionOpeningRecord.objects.select_related("opened_by").filter(process=process).first()
        if opening_record is None:
            return Response(
                {"detail": "La jornada aún no tiene registro de apertura en cero."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ElectionOpeningRecordSerializer(opening_record)
        return Response(serializer.data)


class ElectionProcessScrutinySummaryAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        return Response(build_scrutiny_summary_payload(process))


class ElectionProcessScrutinyExportCsvAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        summary = build_scrutiny_summary_payload(process)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        response["Content-Disposition"] = f'attachment; filename="escrutinio_{safe_name}_{process.id}.csv"'

        writer = csv.writer(response)
        writer.writerow(["proceso_id", process.id])
        writer.writerow(["proceso", process.name])
        writer.writerow(["estado", process.status])
        writer.writerow(["generado_en", summary["summary"]["generated_at"].isoformat()])
        writer.writerow(["total_votos", summary["summary"]["total_votes"]])
        writer.writerow(["total_votos_blanco", summary["summary"]["total_blank_votes"]])
        writer.writerow([])
        writer.writerow(["cargo", "codigo", "numero", "candidato", "votos", "votos_blanco_cargo", "total_cargo"])

        for role in summary["roles"]:
            candidates = role["candidates"]
            if candidates:
                for candidate in candidates:
                    writer.writerow(
                        [
                            role["title"],
                            role["code"],
                            candidate["number"],
                            candidate["name"],
                            candidate["votes"],
                            role["blank_votes"],
                            role["total_votes"],
                        ]
                    )
            else:
                writer.writerow([role["title"], role["code"], "", "", 0, role["blank_votes"], role["total_votes"]])

        return response


class ElectionProcessScrutinyExportXlsxAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        summary = build_scrutiny_summary_payload(process)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Escrutinio"

        sheet.append(["Proceso ID", process.id])
        sheet.append(["Proceso", process.name])
        sheet.append(["Estado", process.status])
        sheet.append(["Generado en", summary["summary"]["generated_at"].isoformat()])
        sheet.append(["Total votos", summary["summary"]["total_votes"]])
        sheet.append(["Total votos en blanco", summary["summary"]["total_blank_votes"]])
        sheet.append([])
        sheet.append(["Cargo", "Código", "Número", "Candidato", "Votos", "Votos en blanco cargo", "Total cargo"])

        for role in summary["roles"]:
            candidates = role["candidates"]
            if candidates:
                for candidate in candidates:
                    sheet.append(
                        [
                            role["title"],
                            role["code"],
                            candidate["number"],
                            candidate["name"],
                            candidate["votes"],
                            role["blank_votes"],
                            role["total_votes"],
                        ]
                    )
            else:
                sheet.append([role["title"], role["code"], "", "", 0, role["blank_votes"], role["total_votes"]])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="escrutinio_{safe_name}_{process.id}.xlsx"'
        return response


class ElectionRoleListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = (
            ElectionRole.objects.select_related("process")
            .annotate(
                votes_count=Count("votes", distinct=True),
                candidates_count=Count("candidates", distinct=True),
            )
            .all()
            .order_by("process_id", "display_order", "id")
        )
        if process_id:
            try:
                queryset = queryset.filter(process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionRoleManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = ElectionRoleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionRoleManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ElectionRoleDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, role_id: int, *args, **kwargs):
        role = ElectionRole.objects.filter(id=role_id).first()
        if role is None:
            return Response({"detail": "No se encontró el cargo electoral."}, status=status.HTTP_404_NOT_FOUND)

        if VoteRecord.objects.filter(role_id=role.id).exists():
            return Response(
                {"detail": "No se puede eliminar el cargo porque ya tiene votos registrados."},
                status=status.HTTP_409_CONFLICT,
            )

        if ElectionCandidate.objects.filter(role_id=role.id).exists():
            return Response(
                {"detail": "No se puede eliminar el cargo porque tiene candidaturas asociadas."},
                status=status.HTTP_409_CONFLICT,
            )

        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PersoneriaCandidateListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = CandidatoPersoneria.objects.select_related("role", "role__process").all().order_by("role_id", "display_order", "id")
        if process_id:
            try:
                queryset = queryset.filter(role__process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionCandidateManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = CandidatoPersoneriaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionCandidateManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class PersoneriaCandidateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, candidate_id: int, *args, **kwargs):
        candidate = CandidatoPersoneria.objects.filter(id=candidate_id).first()
        if candidate is None:
            return Response({"detail": "No se encontró la candidatura de Personería."}, status=status.HTTP_404_NOT_FOUND)

        candidate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContraloriaCandidateListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        queryset = CandidatoContraloria.objects.select_related("role", "role__process").all().order_by("role_id", "display_order", "id")
        if process_id:
            try:
                queryset = queryset.filter(role__process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionCandidateManageSerializer(queryset, many=True)
        return Response({"results": serializer.data, "count": len(serializer.data)})

    def post(self, request, *args, **kwargs):
        serializer = CandidatoContraloriaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(ElectionCandidateManageSerializer(instance).data, status=status.HTTP_201_CREATED)


class ContraloriaCandidateDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, candidate_id: int, *args, **kwargs):
        candidate = CandidatoContraloria.objects.filter(id=candidate_id).first()
        if candidate is None:
            return Response({"detail": "No se encontró la candidatura de Contraloría."}, status=status.HTTP_404_NOT_FOUND)

        candidate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionTokenEligibilityIssuesAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        process_id = request.query_params.get("process_id")
        raw_limit = request.query_params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 200
        except (TypeError, ValueError):
            limit = 200

        limit = max(1, min(limit, 1000))

        queryset = VoterToken.objects.select_related("process").order_by("-created_at", "-id")
        if process_id:
            try:
                queryset = queryset.filter(process_id=int(process_id))
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

        scanned_count = 0
        issues: list[dict] = []

        for token in queryset.iterator():
            scanned_count += 1
            error = get_voter_token_census_eligibility_error(token)
            if error:
                issues.append(
                    {
                        "token_id": token.id,
                        "process_id": token.process_id,
                        "process_name": token.process.name,
                        "token_prefix": token.token_prefix,
                        "status": token.status,
                        "student_grade": token.student_grade,
                        "student_shift": token.student_shift,
                        "metadata": token.metadata,
                        "error": error,
                    }
                )
                if len(issues) >= limit:
                    break

        serializer = ElectionTokenEligibilityIssueSerializer(issues, many=True)
        return Response(
            {
                "results": serializer.data,
                "count": len(serializer.data),
                "limit": limit,
                "scanned_count": scanned_count,
            }
        )


class ElectionEligibleStudentsAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, *args, **kwargs):
        role_code = str(request.query_params.get("role_code") or "").strip().upper()
        if role_code not in {ElectionRole.CODE_PERSONERO, ElectionRole.CODE_CONTRALOR}:
            return Response(
                {"detail": "El parámetro role_code es obligatorio y debe ser PERSONERO o CONTRALOR."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        process_id_raw = request.query_params.get("process_id")
        process_id = None
        if process_id_raw not in (None, ""):
            try:
                process_id = int(process_id_raw)
            except (TypeError, ValueError):
                return Response({"detail": "El parámetro process_id no es válido."}, status=status.HTTP_400_BAD_REQUEST)

            if not ElectionProcess.objects.filter(id=process_id).exists():
                return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        q = str(request.query_params.get("q") or "").strip()
        show_blocked = str(request.query_params.get("show_blocked") or "").strip().lower() in {"1", "true", "yes"}
        raw_limit = request.query_params.get("limit")
        try:
            limit = int(raw_limit) if raw_limit is not None else 20
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        year = (
            AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE)
            .order_by("-year", "-id")
            .only("id", "year")
            .first()
        )
        if year is None:
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "limit": limit,
                    "academic_year": None,
                    "role_code": role_code,
                }
            )

        queryset = (
            Enrollment.objects.select_related("student__user", "grade", "group")
            .filter(status="ACTIVE", academic_year_id=year.id)
            .order_by("student__user__first_name", "student__user__last_name", "id")
        )

        if q:
            queryset = queryset.filter(
                Q(student__user__first_name__icontains=q)
                | Q(student__user__last_name__icontains=q)
                | Q(student__user__username__icontains=q)
                | Q(student__document_number__icontains=q)
            )

        existing_candidate_names: set[str] = set()
        existing_candidate_student_ids: set[int] = set()
        existing_candidate_documents: set[str] = set()
        if process_id is not None:
            existing_candidates_qs = ElectionCandidate.objects.filter(role__process_id=process_id)
            existing_candidate_names = {
                (name or "").strip().lower()
                for name in existing_candidates_qs.values_list("name", flat=True)
            }
            existing_candidate_student_ids = {
                int(student_id)
                for student_id in existing_candidates_qs.filter(student_id_ref__isnull=False).values_list("student_id_ref", flat=True)
            }
            existing_candidate_documents = {
                (document or "").strip().lower()
                for document in existing_candidates_qs.values_list("student_document_number", flat=True)
                if str(document or "").strip()
            }

        results: list[dict] = []
        blocked_results: list[dict] = []
        for enrollment in queryset.iterator():
            grade_value = _grade_value_for_enrollment(enrollment)
            if role_code == ElectionRole.CODE_PERSONERO and grade_value != 11:
                continue
            if role_code == ElectionRole.CODE_CONTRALOR and (grade_value is None or not (6 <= grade_value <= 11)):
                continue

            full_name = (enrollment.student.user.get_full_name() or enrollment.student.user.username or "").strip()
            if not full_name:
                continue

            normalized_name = full_name.lower()
            normalized_document = (enrollment.student.document_number or "").strip().lower()
            block_reason = ""
            if normalized_name in existing_candidate_names:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."
            elif enrollment.student_id in existing_candidate_student_ids:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."
            elif normalized_document and normalized_document in existing_candidate_documents:
                block_reason = "Ya inscrito en otro cargo o en este cargo para la jornada seleccionada."

            group_name = enrollment.group.name if enrollment.group_id and enrollment.group else ""
            shift_value = enrollment.group.shift if enrollment.group_id and enrollment.group else ""

            row = {
                "student_id": enrollment.student_id,
                "enrollment_id": enrollment.id,
                "full_name": full_name,
                "document_number": (enrollment.student.document_number or "").strip(),
                "grade": str(grade_value if grade_value is not None else (enrollment.grade.name or "")).strip(),
                "group": group_name,
                "shift": shift_value,
                "is_blocked": bool(block_reason),
                "block_reason": block_reason,
            }

            if block_reason:
                if show_blocked and len(blocked_results) < limit:
                    blocked_results.append(row)
                continue

            results.append(row)

            if len(results) >= limit and (not show_blocked or len(blocked_results) >= limit):
                break

        return Response(
            {
                "results": results,
                "count": len(results),
                "limit": limit,
                "blocked_results": blocked_results,
                "blocked_count": len(blocked_results),
                "academic_year": {"id": year.id, "year": year.year},
                "role_code": role_code,
            }
        )


def _resolve_student_id_for_member(member: ElectionCensusMember) -> int | None:
    metadata = member.metadata if isinstance(member.metadata, dict) else {}
    student_id_raw = metadata.get("student_id")
    if isinstance(student_id_raw, int):
        return student_id_raw
    if isinstance(student_id_raw, str) and student_id_raw.strip().isdigit():
        return int(student_id_raw.strip())
    if member.student_external_id.isdigit():
        return int(member.student_external_id)
    return None


def _build_process_census_rows(process: ElectionProcess) -> list[dict]:
    members = list(
        ElectionCensusMember.objects.filter(is_active=True, status=ElectionCensusMember.Status.ACTIVE).order_by("id")
    )
    excluded_member_ids = set(
        ElectionProcessCensusExclusion.objects.filter(process=process).values_list("census_member_id", flat=True)
    )

    student_ids: set[int] = set()
    for member in members:
        student_id = _resolve_student_id_for_member(member)
        if student_id is not None:
            student_ids.add(student_id)

    active_year = (
        AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE)
        .order_by("-year", "-id")
        .only("id", "year")
        .first()
    )
    enrollments = Enrollment.objects.select_related("grade", "group")
    if active_year is not None:
        enrollments = enrollments.filter(academic_year_id=active_year.id)
    if student_ids:
        enrollments = enrollments.filter(student_id__in=student_ids, status="ACTIVE")
    else:
        enrollments = enrollments.none()

    enrollment_by_student: dict[int, Enrollment] = {enrollment.student_id: enrollment for enrollment in enrollments}

    rows: list[dict] = []
    for member in members:
        student_id = _resolve_student_id_for_member(member)
        enrollment = enrollment_by_student.get(student_id) if student_id is not None else None
        metadata = member.metadata if isinstance(member.metadata, dict) else {}

        grade_value = _grade_value_from_text(member.grade)
        if enrollment is not None and enrollment.grade.ordinal is not None:
            grade_value = enrollment.grade.ordinal

        group_name = ""
        if enrollment is not None and enrollment.group_id and enrollment.group:
            group_name = enrollment.group.name or ""
        elif isinstance(metadata.get("group"), str):
            group_name = str(metadata.get("group") or "")

        is_excluded = member.id in excluded_member_ids
        rows.append(
            {
                "member_id": member.id,
                "student_external_id": member.student_external_id,
                "student_id": student_id,
                "document_number": member.document_number,
                "full_name": member.full_name,
                "grade": member.grade,
                "grade_value": grade_value,
                "group": group_name,
                "shift": member.shift,
                "campus": member.campus,
                "is_excluded": is_excluded,
                "is_enabled": not is_excluded,
            }
        )

    rows.sort(
        key=lambda row: (
            row["grade_value"] if row["grade_value"] is not None else -1,
            _group_sort_value(row["group"]),
            (row["full_name"] or "").upper(),
        ),
        reverse=True,
    )
    return rows


def _issue_manual_token_for_row(process: ElectionProcess, row: dict) -> str:
    student_external_id = str(row.get("student_external_id") or "").strip()
    if student_external_id:
        VoterToken.objects.filter(
            process=process,
            metadata__student_external_id=student_external_id,
            status=VoterToken.Status.ACTIVE,
        ).update(
            status=VoterToken.Status.REVOKED,
            revoked_at=timezone.now(),
            revoked_reason="Regeneración de código manual para censo por jornada.",
        )

    raw_token = f"VOTO-{secrets.token_hex(5).upper()}"
    token_hash = VoterToken.hash_token(raw_token)
    now = timezone.now()
    expires_at = process.ends_at
    if expires_at is None or expires_at <= now:
        expires_at = timezone.now() + timedelta(hours=24)

    VoterToken.objects.create(
        process=process,
        token_hash=token_hash,
        token_prefix=raw_token[:12],
        status=VoterToken.Status.ACTIVE,
        expires_at=expires_at,
        student_grade=str(row.get("grade") or ""),
        student_shift=str(row.get("shift") or ""),
        metadata={
            "student_external_id": student_external_id,
            "student_id": row.get("student_id"),
            "document_number": row.get("document_number") or "",
            "full_name": row.get("full_name") or "",
            "group": row.get("group") or "",
            "manual_code": raw_token,
            "issued_from": "process_census",
        },
    )
    return raw_token


class ElectionCensusSyncFromEnrollmentsAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, *args, **kwargs):
        previous_sync_id = (
            ElectionCensusSync.objects.order_by("-started_at", "-id").values_list("id", flat=True).first()
        )

        command_stdout = StringIO()
        try:
            call_command(
                "sync_election_census",
                "--source-active-enrollments",
                "--apply",
                stdout=command_stdout,
            )
        except Exception:
            return Response(
                {"detail": "No fue posible sincronizar censo desde matrículas activas."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        latest_sync = ElectionCensusSync.objects.order_by("-started_at", "-id").first()
        if latest_sync is None or latest_sync.id == previous_sync_id:
            return Response(
                {"detail": "La sincronización no generó resultados."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Censo sincronizado desde matrículas activas.",
                "sync": {
                    "id": latest_sync.id,
                    "status": latest_sync.status,
                    "received_count": latest_sync.received_count,
                    "created_count": latest_sync.created_count,
                    "updated_count": latest_sync.updated_count,
                    "deactivated_count": latest_sync.deactivated_count,
                    "unchanged_count": latest_sync.unchanged_count,
                    "errors_count": latest_sync.errors_count,
                    "started_at": latest_sync.started_at,
                    "finished_at": latest_sync.finished_at,
                },
            }
        )


class ElectionProcessCensusAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        try:
            page = int(request.query_params.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("page_size", 10))
        except (TypeError, ValueError):
            page_size = 10
        search_query = str(request.query_params.get("q") or "").strip().lower()

        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        rows = _build_process_census_rows(process)
        if search_query:
            rows = [
                row
                for row in rows
                if search_query in str(row.get("full_name") or "").lower()
                or search_query in str(row.get("document_number") or "").lower()
                or search_query in str(row.get("group") or "").lower()
                or search_query in str(row.get("grade") or "").lower()
                or search_query in str(row.get("shift") or "").lower()
                or search_query in str(row.get("campus") or "").lower()
                or search_query in str(row.get("student_external_id") or "").lower()
            ]
        total_count = len(rows)
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        if page > total_pages:
            page = total_pages

        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_rows = rows[start_index:end_index]

        group_names = sorted({row["group"] for row in rows if row["group"]}, key=_group_sort_value, reverse=True)
        return Response(
            {
                "process": {"id": process.id, "name": process.name, "status": process.status},
                "results": paginated_rows,
                "count": len(paginated_rows),
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "enabled_count": sum(1 for row in rows if row["is_enabled"]),
                "excluded_count": sum(1 for row in rows if row["is_excluded"]),
                "groups": group_names,
            }
        )


class ElectionProcessCensusExcludeAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def post(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        member_id = request.data.get("member_id")
        try:
            member_id = int(member_id)
        except (TypeError, ValueError):
            return Response({"detail": "member_id es obligatorio y debe ser numérico."}, status=status.HTTP_400_BAD_REQUEST)

        member = ElectionCensusMember.objects.filter(id=member_id, is_active=True, status=ElectionCensusMember.Status.ACTIVE).first()
        if member is None:
            return Response({"detail": "No se encontró el estudiante activo en censo."}, status=status.HTTP_404_NOT_FOUND)

        reason = str(request.data.get("reason") or "").strip()
        exclusion, created = ElectionProcessCensusExclusion.objects.get_or_create(
            process=process,
            census_member=member,
            defaults={"reason": reason, "created_by": request.user},
        )
        if not created and reason:
            exclusion.reason = reason
            exclusion.save(update_fields=["reason"])

        return Response({"detail": "Estudiante excluido de la jornada."})


class ElectionProcessCensusIncludeAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def delete(self, request, process_id: int, member_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        deleted, _ = ElectionProcessCensusExclusion.objects.filter(process=process, census_member_id=member_id).delete()
        if deleted == 0:
            return Response({"detail": "El estudiante no estaba excluido para esta jornada."}, status=status.HTTP_404_NOT_FOUND)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ElectionProcessCensusManualCodesXlsxAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        group_filter = str(request.query_params.get("group") or "").strip()
        rows = [row for row in _build_process_census_rows(process) if row["is_enabled"]]
        if group_filter:
            rows = [row for row in rows if (row.get("group") or "") == group_filter]

        if not rows:
            return Response({"detail": "No hay estudiantes habilitados para exportar en la selección actual."}, status=status.HTTP_400_BAD_REQUEST)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Códigos"
        sheet.append(["Proceso", process.name])
        sheet.append(["Grupo", group_filter or "Todos"])
        sheet.append(["Generado en", timezone.now().isoformat()])
        sheet.append([])
        sheet.append(["Grado", "Grupo", "Estudiante", "Documento", "Código manual"])

        for row in rows:
            manual_code = _issue_manual_token_for_row(process, row)
            sheet.append([
                row.get("grade") or "",
                row.get("group") or "",
                row.get("full_name") or "",
                row.get("document_number") or "",
                manual_code,
            ])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        safe_name = process.name.replace('"', '').replace(',', '').replace(' ', '_')
        group_suffix = (group_filter or "todos").replace('"', '').replace(',', '').replace(' ', '_')
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="censo_codigos_{safe_name}_{group_suffix}.xlsx"'
        return response


class ElectionProcessCensusQrPrintAPIView(APIView):
    permission_classes = [IsAuthenticated, CanManageElectionSetup]

    def get(self, request, process_id: int, *args, **kwargs):
        process = ElectionProcess.objects.filter(id=process_id).first()
        if process is None:
            return Response({"detail": "No se encontró la jornada electoral."}, status=status.HTTP_404_NOT_FOUND)

        group_filter = str(request.query_params.get("group") or "").strip()
        rows = [row for row in _build_process_census_rows(process) if row["is_enabled"]]
        if group_filter:
            rows = [row for row in rows if (row.get("group") or "") == group_filter]

        if not rows:
            return Response({"detail": "No hay estudiantes habilitados para impresión en la selección actual."}, status=status.HTTP_400_BAD_REQUEST)

        cards: list[str] = []
        for row in rows:
            manual_code = _issue_manual_token_for_row(process, row)
            qr_image_src = _qr_png_data_uri(manual_code)
            cards.append(
                "".join(
                    [
                        '<article class="card">',
                        f'<h3>{row.get("full_name") or "Estudiante"}</h3>',
                        f'<p><strong>Grado:</strong> {row.get("grade") or "—"} · <strong>Grupo:</strong> {row.get("group") or "—"}</p>',
                        f'<p><strong>Documento:</strong> {row.get("document_number") or "—"}</p>',
                        f'<p><strong>Código manual:</strong> <span class="code">{manual_code}</span></p>',
                        (f'<img src="{qr_image_src}" alt="QR" class="qr" />' if qr_image_src else ''),
                        "</article>",
                    ]
                )
            )

        html = "".join(
            [
                "<!doctype html><html><head><meta charset='utf-8' />",
                "<title>QR censo</title>",
                "<style>",
                "body{font-family:Arial,sans-serif;margin:16px;color:#0f172a}",
                "h1{font-size:18px;margin:0 0 6px}",
                "p.meta{margin:0 0 16px;font-size:12px;color:#475569}",
                ".grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
                ".card{border:1px solid #cbd5e1;border-radius:8px;padding:10px;break-inside:avoid}",
                ".card h3{margin:0 0 6px;font-size:14px}",
                ".card p{margin:2px 0;font-size:12px}",
                ".code{font-weight:700;letter-spacing:0.5px}",
                ".qr{width:120px;height:120px;margin-top:8px}",
                "@media print{body{margin:8px}.grid{gap:8px}}",
                "</style></head><body>",
                f"<h1>Censo habilitado para votación · {process.name}</h1>",
                f"<p class='meta'>Grupo: {group_filter or 'Todos'} · Generado: {timezone.now().isoformat()}</p>",
                f"<section class='grid'>{''.join(cards)}</section>",
                "</body></html>",
            ]
        )
        return HttpResponse(html)
