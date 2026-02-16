from __future__ import annotations

import json
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import pagination, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import log_event
from notifications.models import Notification
from notifications.services import create_notification
from students.models import Enrollment, FamilyMember, ObserverAnnotation
from users.permissions import IsCoordinator
from reports.models import ReportJob
from reports.serializers import ReportJobSerializer
from reports.tasks import generate_report_job_pdf
from discipline.models import DisciplineCase

from .ai import AIService, AIServiceError
from .commission_services import compute_difficulties_for_commission, summarize_difficulty_results
from .commission_serializers import (
    CommissionRuleConfigSerializer,
    CommissionSerializer,
    CommissionStudentDecisionSerializer,
    CommitmentActaSerializer,
)
from .models import (
    Commission,
    CommissionRuleConfig,
    CommissionStudentDecision,
    CommitmentActa,
)
from .reports import (
    build_commitment_acta_context,
    build_commission_group_acta_context,
    get_failed_subject_names_for_decision,
)


logger = logging.getLogger(__name__)


def _default_commitments_payload() -> dict[str, list[str]]:
    return {
        "student_commitments": [
            "Asistir puntualmente a clases.",
            "Cumplir con las actividades académicas asignadas.",
            "Participar activamente en clases y refuerzos.",
            "Solicitar apoyo a los docentes cuando se presenten dudas.",
        ],
        "guardian_commitments": [
            "Realizar seguimiento permanente a las tareas y compromisos académicos del estudiante.",
            "Asistir a las citaciones realizadas por la institución.",
            "Brindar el acompañamiento necesario en casa.",
            "Fomentar un ambiente propicio para el estudio.",
        ],
        "institution_commitments": [
            "Brindar el acompañamiento pedagógico necesario.",
            "Ofrecer espacios de refuerzo académico.",
            "Informar oportunamente sobre avances o retrocesos del estudiante.",
            "Apoyar el proceso a través del equipo de orientación escolar.",
        ],
    }


def _resolve_commitments_payload_with_ai(*, decision: CommissionStudentDecision, institution_name: str) -> dict[str, list[str]]:
    defaults = _default_commitments_payload()
    subject_names = get_failed_subject_names_for_decision(decision)
    enrollment = decision.enrollment
    student_name = enrollment.student.user.get_full_name()
    grade_name = getattr(getattr(enrollment, "grade", None), "name", "") or ""
    period_name = getattr(getattr(decision.commission, "period", None), "name", "") or ""

    context = {
        "institution_name": institution_name,
        "student_name": student_name,
        "grade_name": grade_name,
        "commission_type": decision.commission.commission_type,
        "period_name": period_name,
        "failed_subjects": subject_names,
    }

    try:
        payload = AIService().generate_commitments_blocks(context)
    except AIServiceError:
        logger.warning(
            "AI commitments generation unavailable; using defaults",
            extra={"decision_id": decision.id},
        )
        return defaults
    except Exception:
        logger.exception("Unexpected error generating AI commitments; using defaults", extra={"decision_id": decision.id})
        return defaults

    if not isinstance(payload, dict):
        return defaults

    for key in ("student_commitments", "guardian_commitments", "institution_commitments"):
        values = payload.get(key)
        if not isinstance(values, list):
            return defaults
        clean_values = [str(item).strip() for item in values if str(item).strip()]
        if not clean_values:
            return defaults
        defaults[key] = clean_values

    return defaults


def _format_commitments_for_observer(payload: dict[str, list[str]]) -> str:
    sections = [
        ("Compromisos del estudiante", payload.get("student_commitments") or []),
        ("Compromisos del acudiente", payload.get("guardian_commitments") or []),
        ("Compromisos de la institución", payload.get("institution_commitments") or []),
    ]

    lines: list[str] = []
    for title, items in sections:
        clean_items = [str(item).strip() for item in items if str(item).strip()]
        if not clean_items:
            continue
        lines.append(f"{title}:")
        lines.extend([f"- {item}" for item in clean_items])
        lines.append("")

    return "\n".join(lines).strip()


def _resolve_group_acta_ai_blocks(
    *,
    commission: Commission,
    institution_name: str,
    grade_group_label: str,
    period_name: str,
    total_students: int,
    flagged_count: int,
    pending_count: int,
    reprobated_count: int,
) -> dict[str, object]:
    default_payload: dict[str, object] = {
        "executive_summary": (
            "La comisión consolidó el análisis académico del grupo y priorizó intervenciones sobre los casos "
            "con mayor nivel de riesgo para fortalecer el desempeño en el siguiente corte."
        ),
        "general_observations": [
            "Fortalecer procesos de acompañamiento pedagógico y planes de mejora individual.",
            "Dar seguimiento continuo desde dirección de grupo y orientación escolar.",
            "Priorizar remisión al comité de apoyo pedagógico en casos de alto riesgo.",
        ],
        "agreed_commitments": [
            "Docentes: implementar estrategias remediales por competencias críticas.",
            "Directores de grupo: realizar seguimiento individual a estudiantes en riesgo.",
            "Familias: asistir a reuniones de seguimiento y verificar cumplimiento de planes.",
        ],
        "institutional_commitments": [
            "Docentes: implementar estrategias remediales por competencias críticas.",
            "Directores de grupo: realizar seguimiento individual a estudiantes en riesgo.",
            "Familias: asistir a reuniones de seguimiento y verificar cumplimiento de planes.",
        ],
    }

    context = {
        "institution_name": institution_name,
        "commission_type": commission.commission_type,
        "grade_group": grade_group_label,
        "period_name": period_name,
        "totals": {
            "total_students": int(total_students),
            "flagged_count": int(flagged_count),
            "pending_count": int(pending_count),
            "reprobated_count": int(reprobated_count),
        },
    }

    try:
        payload = AIService().generate_commission_group_acta_blocks(context)
    except AIServiceError:
        logger.warning(
            "AI group acta generation unavailable; using defaults",
            extra={"commission_id": commission.id},
        )
        return default_payload
    except Exception:
        logger.exception(
            "Unexpected error generating group acta AI blocks; using defaults",
            extra={"commission_id": commission.id},
        )
        return default_payload

    if not isinstance(payload, dict):
        return default_payload

    executive_summary = str(payload.get("executive_summary") or "").strip()
    observations = payload.get("general_observations")
    commitments = payload.get("agreed_commitments")
    if not isinstance(observations, list):
        observations = payload.get("institutional_observations")
    if not isinstance(commitments, list):
        commitments = payload.get("institutional_commitments")
    if not executive_summary:
        return default_payload
    if not isinstance(observations, list):
        return default_payload
    if not isinstance(commitments, list):
        return default_payload

    clean_observations = [str(item).strip() for item in observations if str(item).strip()]
    clean_commitments = [str(item).strip() for item in commitments if str(item).strip()]
    if not clean_observations or not clean_commitments:
        return default_payload

    return {
        "executive_summary": executive_summary,
        "general_observations": clean_observations,
        "agreed_commitments": clean_commitments,
        "institutional_commitments": clean_commitments,
    }


class CommissionDecisionPagination(pagination.PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        payload = {
            "count": self.page.paginator.count,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        }
        summary = getattr(self, "summary", None)
        if summary is not None:
            payload["summary"] = summary
        return Response(payload)


class CommissionRuleConfigViewSet(viewsets.ModelViewSet):
    queryset = CommissionRuleConfig.objects.select_related("institution", "academic_year")
    serializer_class = CommissionRuleConfigSerializer
    permission_classes = [IsAuthenticated, IsCoordinator]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["institution", "academic_year", "is_active"]


class CommissionViewSet(viewsets.ModelViewSet):
    queryset = Commission.objects.select_related(
        "institution",
        "academic_year",
        "period",
        "group",
        "created_by",
        "closed_by",
    )
    serializer_class = CommissionSerializer
    permission_classes = [IsAuthenticated, IsCoordinator]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["commission_type", "status", "academic_year", "period", "group"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        commission = self.get_object()

        acta_ids = list(
            CommitmentActa.objects.filter(decision__commission=commission)
            .values_list("id", flat=True)
            .distinct()
        )

        annotation_ids = list(
            CommitmentActa.objects.filter(
                decision__commission=commission,
                observer_annotation__isnull=False,
            )
            .values_list("observer_annotation_id", flat=True)
            .distinct()
        )

        with transaction.atomic():
            deleted_annotations, _ = ObserverAnnotation.objects.filter(
                Q(id__in=annotation_ids)
                | Q(rule_key__startswith=f"COMMISSION_ACTA:{commission.id}:")
            ).delete()

            deleted_notifications, _ = Notification.objects.filter(
                type="COMMISSION_ACTA",
                dedupe_key__in=[f"commission_acta:{acta_id}" for acta_id in acta_ids],
            ).delete()

            commission_id = int(commission.id)
            self.perform_destroy(commission)

        log_event(
            request,
            event_type="COMMISSION_DELETED",
            object_type="academic.Commission",
            object_id=commission_id,
            status_code=status.HTTP_204_NO_CONTENT,
            metadata={
                "observer_annotations_deleted": int(deleted_annotations),
                "notifications_deleted": int(deleted_notifications),
            },
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="group-acta")
    def group_acta(self, request, pk=None):
        commission = self.get_object()
        if commission.commission_type != Commission.TYPE_EVALUATION:
            return Response(
                {"detail": "El acta grupal está disponible únicamente para comisiones de evaluación."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        want_pdf = (request.query_params.get("format") or "").lower() == "pdf"
        want_async = (request.query_params.get("async") or "").strip().lower() in {"1", "true", "yes"}

        if want_async:
            job = ReportJob.objects.create(
                created_by=request.user,
                report_type=ReportJob.ReportType.ACADEMIC_COMMISSION_GROUP_ACTA,
                params={"commission_id": int(commission.id)},
            )
            generate_report_job_pdf.delay(job.id)
            out = ReportJobSerializer(job, context={"request": request}).data
            return Response(out, status=status.HTTP_202_ACCEPTED)

        total_students = commission.student_decisions.count()
        flagged_count = commission.student_decisions.filter(is_flagged=True).count()
        pending_count = commission.student_decisions.filter(
            is_flagged=True,
            decision__in=[
                CommissionStudentDecision.DECISION_PENDING,
                CommissionStudentDecision.DECISION_FOLLOW_UP,
            ],
        ).count()
        reprobated_count = max(0, flagged_count - pending_count)

        group = commission.group
        institution_name = (
            getattr(getattr(commission, "institution", None), "name", "")
            or "Institución Educativa"
        )
        grade_name = getattr(getattr(group, "grade", None), "name", "") if group else ""
        group_name = getattr(group, "name", "") if group else ""
        grade_group_label = f"{grade_name} ({group_name})" if grade_name and group_name else (grade_name or group_name or "General")
        period_name = getattr(getattr(commission, "period", None), "name", "") if commission.period_id else "Cierre anual"

        ai_blocks = _resolve_group_acta_ai_blocks(
            commission=commission,
            institution_name=institution_name,
            grade_group_label=grade_group_label,
            period_name=period_name,
            total_students=total_students,
            flagged_count=flagged_count,
            pending_count=pending_count,
            reprobated_count=reprobated_count,
        )

        ctx = build_commission_group_acta_context(
            commission=commission,
            generated_by=request.user,
            ai_blocks=ai_blocks,
        )
        html = render_to_string("academic/reports/commission_group_acta.html", ctx)

        if not want_pdf:
            response = HttpResponse(html, content_type="text/html; charset=utf-8")
            response["Content-Disposition"] = f'inline; filename="comision-grupal-{commission.id}.html"'
            return response

        try:
            from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

            pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        except WeasyPrintUnavailableError as e:
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            logger.exception("Error generando PDF de acta grupal de comisión", extra={"commission_id": commission.id})
            return Response(
                {"detail": "No fue posible generar el PDF en este momento."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="comision-grupal-{commission.id}.pdf"'
        return response

    @action(detail=True, methods=["get"], url_path="discipline-students")
    def discipline_students(self, request, pk=None):
        commission = self.get_object()
        group = commission.group

        if group is None:
            return Response(
                {"count": 0, "results": []},
                status=status.HTTP_200_OK,
            )

        enrollments = list(
            Enrollment.objects.select_related("student", "student__user")
            .filter(
                academic_year_id=commission.academic_year_id,
                group_id=group.id,
                status="ACTIVE",
            )
            .order_by("student__user__last_name", "student__user__first_name")
        )
        student_ids = [int(item.student_id) for item in enrollments]
        if not student_ids:
            return Response({"count": 0, "results": []}, status=status.HTTP_200_OK)

        annotations_qs = ObserverAnnotation.objects.select_related("student", "student__user").filter(
            is_deleted=False,
            student_id__in=student_ids,
            annotation_type__in=[ObserverAnnotation.TYPE_ALERT, ObserverAnnotation.TYPE_OBSERVATION],
        )

        if commission.period_id:
            annotations_qs = annotations_qs.filter(
                Q(period_id=commission.period_id)
                | Q(
                    period__isnull=True,
                    created_at__date__gte=commission.period.start_date,
                    created_at__date__lte=commission.period.end_date,
                )
            )

        annotations = list(annotations_qs.order_by("student_id", "-created_at"))
        summary: dict[int, dict[str, object]] = {}
        for annotation in annotations:
            student_id = int(annotation.student_id)
            bucket = summary.setdefault(
                student_id,
                {
                    "student_id": student_id,
                    "student_name": annotation.student.user.get_full_name().upper(),
                    "annotations_count": 0,
                    "observer_annotations_count": 0,
                    "discipline_cases_count": 0,
                    "sources": [],
                    "latest_annotation": "",
                    "latest_annotation_at": None,
                    "level": "TIPO I",
                },
            )
            bucket["annotations_count"] = int(bucket["annotations_count"]) + 1
            bucket["observer_annotations_count"] = int(bucket["observer_annotations_count"]) + 1
            if "ANNOTATION" not in bucket["sources"]:
                bucket["sources"].append("ANNOTATION")
            if not bucket["latest_annotation"]:
                latest_text = (annotation.text or annotation.title or "").strip()
                bucket["latest_annotation"] = latest_text or "Presenta anotaciones disciplinarias durante el periodo."
                bucket["latest_annotation_at"] = timezone.localtime(annotation.created_at).isoformat()

        cases_qs = DisciplineCase.objects.select_related("student", "student__user", "enrollment").filter(
            student_id__in=student_ids,
            enrollment__academic_year_id=commission.academic_year_id,
            enrollment__group_id=group.id,
        )
        if commission.period_id:
            cases_qs = cases_qs.filter(
                occurred_at__date__gte=commission.period.start_date,
                occurred_at__date__lte=commission.period.end_date,
            )

        cases = list(cases_qs.order_by("student_id", "-occurred_at"))
        for case in cases:
            student_id = int(case.student_id)
            bucket = summary.setdefault(
                student_id,
                {
                    "student_id": student_id,
                    "student_name": case.student.user.get_full_name().upper(),
                    "annotations_count": 0,
                    "observer_annotations_count": 0,
                    "discipline_cases_count": 0,
                    "sources": [],
                    "latest_annotation": "",
                    "latest_annotation_at": None,
                    "level": "TIPO I",
                },
            )
            bucket["annotations_count"] = int(bucket["annotations_count"]) + 1
            bucket["discipline_cases_count"] = int(bucket["discipline_cases_count"]) + 1
            if "CASE" not in bucket["sources"]:
                bucket["sources"].append("CASE")
            if not bucket["latest_annotation"]:
                narrative = (case.narrative or "").strip()
                bucket["latest_annotation"] = narrative or "Caso disciplinario registrado durante el periodo."
                bucket["latest_annotation_at"] = timezone.localtime(case.occurred_at).isoformat()

        results: list[dict[str, object]] = []
        for item in summary.values():
            count = int(item.get("annotations_count", 0))
            if count >= 5:
                item["level"] = "TIPO III"
            elif count >= 3:
                item["level"] = "TIPO II"
            else:
                item["level"] = "TIPO I"
            results.append(item)

        results.sort(
            key=lambda item: (
                -int(item.get("annotations_count", 0)),
                str(item.get("student_name", "")),
            )
        )

        return Response(
            {
                "count": len(results),
                "results": results,
            },
            status=status.HTTP_200_OK,
        )

    def _ensure_status(self, commission: Commission, *, allowed: set[str], message: str):
        if commission.status not in allowed:
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        return None

    @action(detail=True, methods=["get"], url_path="preview-difficulties")
    def preview_difficulties(self, request, pk=None):
        commission = self.get_object()
        results = compute_difficulties_for_commission(commission)
        summary = summarize_difficulty_results(results)

        decisions_by_enrollment = {
            int(d.enrollment_id): d
            for d in CommissionStudentDecision.objects.filter(commission=commission)
            .select_related("enrollment", "enrollment__student", "enrollment__student__user")
            .only("id", "enrollment_id", "decision", "is_flagged")
        }

        payload = []
        for item in results:
            decision = decisions_by_enrollment.get(int(item.enrollment_id))
            payload.append(
                {
                    "enrollment_id": int(item.enrollment_id),
                    "failed_subjects_count": int(item.failed_subjects_count),
                    "failed_areas_count": int(item.failed_areas_count),
                    "is_flagged": bool(item.is_flagged),
                    "decision_id": int(decision.id) if decision is not None else None,
                    "decision": decision.decision if decision is not None else None,
                }
            )

        return Response({"count": len(payload), "summary": summary, "results": payload}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="refresh-difficulties")
    def refresh_difficulties(self, request, pk=None):
        commission = self.get_object()
        invalid = self._ensure_status(
            commission,
            allowed={Commission.STATUS_DRAFT},
            message="Solo puedes recalcular dificultades cuando la comisión está en borrador.",
        )
        if invalid is not None:
            return invalid

        with transaction.atomic():
            results = compute_difficulties_for_commission(commission)
            summary = summarize_difficulty_results(results)
            result_by_enrollment = {int(r.enrollment_id): r for r in results}

            existing = {
                int(d.enrollment_id): d
                for d in CommissionStudentDecision.objects.select_for_update().filter(commission=commission)
            }

            created = 0
            updated = 0

            for enrollment_id, item in result_by_enrollment.items():
                decision = existing.get(enrollment_id)
                if decision is None:
                    CommissionStudentDecision.objects.create(
                        commission=commission,
                        enrollment_id=enrollment_id,
                        failed_subjects_count=int(item.failed_subjects_count),
                        failed_areas_count=int(item.failed_areas_count),
                        is_flagged=bool(item.is_flagged),
                    )
                    created += 1
                    continue

                decision.failed_subjects_count = int(item.failed_subjects_count)
                decision.failed_areas_count = int(item.failed_areas_count)
                decision.is_flagged = bool(item.is_flagged)
                decision.save(update_fields=["failed_subjects_count", "failed_areas_count", "is_flagged", "updated_at"])
                updated += 1

            stale_ids = [
                int(decision.id)
                for enrollment_id, decision in existing.items()
                if enrollment_id not in result_by_enrollment
            ]
            deleted = 0
            if stale_ids:
                deleted, _ = CommissionStudentDecision.objects.filter(id__in=stale_ids).delete()

        log_event(
            request,
            event_type="COMMISSION_REFRESH_DIFFICULTIES",
            object_type="academic.Commission",
            object_id=commission.id,
            status_code=status.HTTP_200_OK,
            metadata={"created": created, "updated": updated, "deleted": deleted},
        )

        return Response(
            {"created": created, "updated": updated, "deleted": deleted, "summary": summary},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        commission = self.get_object()
        invalid = self._ensure_status(
            commission,
            allowed={Commission.STATUS_IN_PROGRESS},
            message="Solo puedes cerrar una comisión en curso.",
        )
        if invalid is not None:
            return invalid

        commission.status = Commission.STATUS_CLOSED
        commission.closed_by = request.user
        commission.closed_at = timezone.now()
        commission.save(update_fields=["status", "closed_by", "closed_at", "updated_at"])

        log_event(
            request,
            event_type="COMMISSION_CLOSED",
            object_type="academic.Commission",
            object_id=commission.id,
            status_code=status.HTTP_200_OK,
            metadata={"commission_type": commission.commission_type},
        )

        return Response(self.get_serializer(commission).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        commission = self.get_object()
        invalid = self._ensure_status(
            commission,
            allowed={Commission.STATUS_DRAFT},
            message="Solo puedes iniciar una comisión en borrador.",
        )
        if invalid is not None:
            return invalid

        commission.status = Commission.STATUS_IN_PROGRESS
        commission.save(update_fields=["status", "updated_at"])

        log_event(
            request,
            event_type="COMMISSION_STARTED",
            object_type="academic.Commission",
            object_id=commission.id,
            status_code=status.HTTP_200_OK,
            metadata={"commission_type": commission.commission_type},
        )

        return Response(self.get_serializer(commission).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="generate-actas-async")
    def generate_actas_async(self, request, pk=None):
        commission = self.get_object()
        invalid = self._ensure_status(
            commission,
            allowed={Commission.STATUS_IN_PROGRESS},
            message="Solo puedes encolar actas cuando la comisión está en curso.",
        )
        if invalid is not None:
            return invalid

        only_flagged = str(request.data.get("only_flagged", "true")).strip().lower() in {"1", "true", "yes"}
        decision_ids_raw = request.data.get("decision_ids")

        qs = CommissionStudentDecision.objects.filter(commission=commission)
        if only_flagged:
            qs = qs.filter(is_flagged=True)

        if isinstance(decision_ids_raw, list) and decision_ids_raw:
            try:
                decision_ids = [int(x) for x in decision_ids_raw]
            except Exception:
                return Response({"detail": "decision_ids inválido"}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(id__in=decision_ids)

        decisions = list(qs.only("id"))
        if not decisions:
            return Response({"detail": "No hay decisiones para generar actas."}, status=status.HTTP_400_BAD_REQUEST)

        jobs = []
        for decision in decisions:
            job = ReportJob.objects.create(
                created_by=request.user,
                report_type=ReportJob.ReportType.ACADEMIC_COMMISSION_ACTA,
                params={"decision_id": int(decision.id)},
            )
            generate_report_job_pdf.delay(job.id)
            jobs.append(job)

        out = ReportJobSerializer(jobs, many=True, context={"request": request}).data

        log_event(
            request,
            event_type="COMMISSION_ACTA_BULK_QUEUED",
            object_type="academic.Commission",
            object_id=commission.id,
            status_code=status.HTTP_202_ACCEPTED,
            metadata={"jobs": len(jobs), "only_flagged": only_flagged},
        )

        return Response({"count": len(out), "jobs": out}, status=status.HTTP_202_ACCEPTED)


class CommissionStudentDecisionViewSet(viewsets.ModelViewSet):
    queryset = CommissionStudentDecision.objects.select_related(
        "commission",
        "enrollment",
        "enrollment__student",
        "enrollment__student__user",
        "enrollment__group",
        "enrollment__group__director",
        "decided_by",
    )
    serializer_class = CommissionStudentDecisionSerializer
    permission_classes = [IsAuthenticated, IsCoordinator]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["commission", "is_flagged", "decision", "enrollment__group"]
    pagination_class = CommissionDecisionPagination

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        total_students = queryset.count()
        total_flagged = queryset.filter(is_flagged=True).count()
        total_not_flagged = total_students - total_flagged
        summary = {
            "total_students": total_students,
            "total_flagged": total_flagged,
            "total_not_flagged": total_not_flagged,
            "flagged_rate": round((total_flagged / total_students) * 100, 2) if total_students > 0 else 0.0,
        }

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            if self.paginator is not None:
                self.paginator.summary = summary
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"count": total_students, "results": serializer.data, "summary": summary})

    def perform_update(self, serializer):
        if serializer.instance.commission.status != Commission.STATUS_IN_PROGRESS:
            raise serializers.ValidationError({"detail": "Solo puedes actualizar decisiones en comisiones en curso."})
        serializer.save(decided_by=self.request.user, decided_at=timezone.now())

    @action(detail=True, methods=["post"], url_path="generate-acta")
    def generate_acta(self, request, pk=None):
        decision = self.get_object()
        commission = decision.commission
        if commission.status != Commission.STATUS_IN_PROGRESS:
            return Response(
                {"detail": "Solo puedes generar actas cuando la comisión está en curso."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        enrollment = decision.enrollment
        student = enrollment.student
        student_user = student.user

        guardian = (
            FamilyMember.objects.filter(student_id=student.pk, is_main_guardian=True)
            .only("full_name")
            .first()
        )
        if guardian is None:
            guardian = FamilyMember.objects.filter(student_id=student.pk).only("full_name").first()

        director_user = getattr(getattr(enrollment, "group", None), "director", None)

        manual_commitments = (request.data.get("commitments") or "").strip()
        annotation_commitments_text = manual_commitments
        if manual_commitments:
            commitments_text = manual_commitments
        else:
            commitments_payload = _resolve_commitments_payload_with_ai(
                decision=decision,
                institution_name=getattr(commission.institution, "name", "") or "",
            )
            commitments_text = json.dumps(commitments_payload, ensure_ascii=False)
            annotation_commitments_text = _format_commitments_for_observer(commitments_payload)

        title = request.data.get("title") or "Acta de compromiso académico"
        director_name = director_user.get_full_name() if director_user is not None else ""
        guardian_name = guardian.full_name if guardian is not None else ""
        student_name = student_user.get_full_name()

        with transaction.atomic():
            acta, created = CommitmentActa.objects.get_or_create(
                decision=decision,
                defaults={
                    "title": title,
                    "commitments": commitments_text,
                    "student_name": student_name,
                    "guardian_name": guardian_name,
                    "director_name": director_name,
                    "generated_by": request.user,
                },
            )

            if not created:
                acta.title = title
                acta.commitments = commitments_text
                acta.student_name = student_name
                acta.guardian_name = guardian_name
                acta.director_name = director_name
                acta.generated_by = request.user
                acta.save(
                    update_fields=[
                        "title",
                        "commitments",
                        "student_name",
                        "guardian_name",
                        "director_name",
                        "generated_by",
                        "updated_at",
                    ]
                )

            rule_key = f"COMMISSION_ACTA:{commission.id}:{decision.id}"
            annotation, _ = ObserverAnnotation.objects.get_or_create(
                student_id=student.pk,
                period=commission.period,
                rule_key=rule_key,
                defaults={
                    "annotation_type": ObserverAnnotation.TYPE_COMMITMENT,
                    "title": "Compromiso académico generado en comisión",
                    "text": (
                        f"Se generó acta de compromiso académico para {student_name} "
                        f"en comisión {commission.get_commission_type_display().lower()}."
                    ),
                    "commitments": annotation_commitments_text,
                    "created_by": request.user,
                    "is_automatic": True,
                    "meta": {
                        "commission_id": int(commission.id),
                        "decision_id": int(decision.id),
                        "source": "commission_acta",
                    },
                },
            )

            annotation.annotation_type = ObserverAnnotation.TYPE_COMMITMENT
            annotation.title = "Compromiso académico generado en comisión"
            annotation.text = (
                f"Se generó acta de compromiso académico para {student_name} "
                f"en comisión {commission.get_commission_type_display().lower()}."
            )
            annotation.commitments = annotation_commitments_text
            annotation.is_automatic = True
            annotation.meta = {
                "commission_id": int(commission.id),
                "decision_id": int(decision.id),
                "source": "commission_acta",
            }
            annotation.updated_by = request.user
            if annotation.created_by_id is None:
                annotation.created_by = request.user
            annotation.save(
                update_fields=[
                    "annotation_type",
                    "title",
                    "text",
                    "commitments",
                    "is_automatic",
                    "meta",
                    "created_by",
                    "updated_by",
                    "updated_at",
                ]
            )

            acta.observer_annotation = annotation
            acta.save(update_fields=["observer_annotation", "updated_at"])

            decision.decision = CommissionStudentDecision.DECISION_COMMITMENT
            decision.decided_by = request.user
            decision.decided_at = timezone.now()
            decision.save(update_fields=["decision", "decided_by", "decided_at", "updated_at"])

        if director_user is not None and director_user.id != request.user.id:
            create_notification(
                recipient=director_user,
                type="COMMISSION_ACTA",
                title="Nueva acta de compromiso académico",
                body=f"{student_name}: se generó un acta de compromiso académico.",
                dedupe_key=f"commission_acta:{acta.id}",
                dedupe_within_seconds=3600,
            )

        log_event(
            request,
            event_type="COMMISSION_ACTA_GENERATED",
            object_type="academic.CommitmentActa",
            object_id=acta.id,
            status_code=status.HTTP_200_OK,
            metadata={"commission_id": commission.id, "decision_id": decision.id},
        )

        return Response(CommitmentActaSerializer(acta).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="acta")
    def acta(self, request, pk=None):
        decision = self.get_object()
        if not hasattr(decision, "commitment_acta"):
            return Response(
                {"detail": "Primero debes generar el acta para esta decisión."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        want_pdf = (request.query_params.get("format") or "").lower() == "pdf"
        want_async = (request.query_params.get("async") or "").strip().lower() in {"1", "true", "yes"}

        if want_async:
            job = ReportJob.objects.create(
                created_by=request.user,
                report_type=ReportJob.ReportType.ACADEMIC_COMMISSION_ACTA,
                params={"decision_id": int(decision.id)},
            )
            generate_report_job_pdf.delay(job.id)
            out = ReportJobSerializer(job, context={"request": request}).data
            return Response(out, status=status.HTTP_202_ACCEPTED)

        ctx = build_commitment_acta_context(decision=decision, generated_by=request.user)
        html = render_to_string("academic/reports/commission_commitment_acta.html", ctx)

        if not want_pdf:
            response = HttpResponse(html, content_type="text/html; charset=utf-8")
            response["Content-Disposition"] = f'inline; filename="comision-acta-decision-{decision.id}.html"'
            return response

        try:
            from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

            pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        except WeasyPrintUnavailableError as e:
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            logger.exception("Error generando PDF de acta de comisión", extra={"decision_id": decision.id})
            return Response(
                {"detail": "No fue posible generar el PDF en este momento. Intenta usando Actas async."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="comision-acta-decision-{decision.id}.pdf"'
        response["Deprecation"] = "true"
        response["Link"] = '</api/reports/jobs/>; rel="alternate"'
        return response


class CommitmentActaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CommitmentActa.objects.select_related(
        "decision",
        "decision__commission",
        "decision__enrollment",
        "decision__enrollment__student",
        "generated_by",
        "observer_annotation",
    )
    serializer_class = CommitmentActaSerializer
    permission_classes = [IsAuthenticated, IsCoordinator]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["decision__commission", "decision__enrollment", "generated_by"]
