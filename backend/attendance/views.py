from __future__ import annotations
import traceback
from datetime import date
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.http import HttpResponse
from django.utils import timezone
from django.template.loader import render_to_string
from rest_framework import status, viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django_filters.rest_framework import DjangoFilterBackend

from academic.models import Group, Period, TeacherAssignment
from core.models import Institution
from students.models import Enrollment

from .models import AttendanceRecord, AttendanceSession
from .serializers import (
    AttendanceAttachExcuseSerializer,
    AttendanceBulkMarkSerializer,
    AttendanceMarkTardySerializer,
    AttendanceRecordSerializer,
    AttendanceSessionCreateSerializer,
    AttendanceSessionSerializer,
)

from notifications.services import admin_like_users_qs, notify_users
from users.models import User

from .reports import build_attendance_manual_sheet_context, user_can_access_group


def _is_admin_user(user) -> bool:
    role = getattr(user, "role", None)
    return role in {User.ROLE_ADMIN, User.ROLE_SUPERADMIN}


def _user_can_access_session(user, session: AttendanceSession) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "role", None) == "TEACHER":
        return session.teacher_assignment.teacher_id == user.id

    # Administrative staff: allow (can be tightened later).
    return True


def _auto_close_if_expired(session: AttendanceSession) -> AttendanceSession:
    """Auto-lock sessions 1 hour after starts_at.

    This enforces the rule even without a background scheduler: any subsequent
    read/write will see the session as locked and will prevent edits.
    """

    if session.locked_at:
        return session

    try:
        deadline = session.starts_at + timedelta(hours=1)
    except Exception:
        return session

    now = timezone.now()
    if now >= deadline:
        session.locked_at = now
        session.save(update_fields=["locked_at", "updated_at"])
    return session


def _user_can_access_group(user, group: Group) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "role", None) == "TEACHER":
        if group.director_id == user.id:
            return True
        return TeacherAssignment.objects.filter(teacher_id=user.id, group_id=group.id).exists()

    # Administrative staff: allow.
    return True


class AttendanceManualSheetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Printable attendance control sheet for manual use.

        Query params:
        - group_id (required): academic.Group id
        - format (optional): pdf (default) | html
        - columns (optional): number of absence columns (default 24)
        """

        group_id_raw = request.query_params.get("group_id")
        if not group_id_raw:
            return Response({"detail": "group_id es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            group_id = int(group_id_raw)
        except Exception:
            return Response({"detail": "group_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        fmt = (request.query_params.get("format") or "pdf").strip().lower()
        want_async = (request.query_params.get("async") or "").strip().lower() in {"1", "true", "yes"}
        try:
            cols = int(request.query_params.get("columns") or "24")
        except Exception:
            cols = 24
        cols = max(1, min(cols, 40))

        group = (
            Group.objects.select_related("grade", "academic_year", "director")
            .filter(id=group_id)
            .first()
        )
        if not group:
            return Response({"detail": "Grupo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if not user_can_access_group(request.user, group):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if want_async and fmt == "pdf":
            from datetime import timedelta  # noqa: PLC0415
            from reports.models import ReportJob  # noqa: PLC0415
            from reports.serializers import ReportJobSerializer  # noqa: PLC0415
            from reports.tasks import generate_report_job_pdf  # noqa: PLC0415

            ttl_hours = int(getattr(settings, "REPORT_JOBS_TTL_HOURS", 24))
            expires_at = timezone.now() + timedelta(hours=ttl_hours)

            job = ReportJob.objects.create(
                created_by=request.user,
                report_type=ReportJob.ReportType.ATTENDANCE_MANUAL_SHEET,
                params={"group_id": group.id, "columns": cols},
                expires_at=expires_at,
            )
            generate_report_job_pdf.delay(job.id)
            out = ReportJobSerializer(job, context={"request": request}).data
            return Response(out, status=status.HTTP_202_ACCEPTED)

        ctx = build_attendance_manual_sheet_context(group=group, user=request.user, columns=cols)
        html_string = render_to_string(
            "attendance/reports/attendance_manual_sheet_pdf.html",
            ctx,
        )

        if fmt == "html":
            return HttpResponse(html_string, content_type="text/html; charset=utf-8")

        # PDF by default.
        try:
            from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

            pdf_bytes = render_pdf_bytes_from_html(html=html_string, base_url=str(settings.BASE_DIR))

            filename = f"planilla_asistencia_{ctx.get('group_label') or group.id}.pdf".replace(" ", "_")
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            response["Deprecation"] = "true"
            sunset = getattr(settings, "REPORTS_SYNC_SUNSET_DATE", "2026-06-30")
            response["Sunset"] = str(sunset)
            response["Link"] = '</api/reports/jobs/>; rel="alternate"'
            return response
        except WeasyPrintUnavailableError as e:
            payload = {"detail": str(e)}
            if getattr(settings, "DEBUG", False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            payload = {"detail": "Error generando PDF", "error": str(e)}
            if getattr(settings, "DEBUG", False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AttendanceSessionPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class AttendanceSessionViewSet(viewsets.ModelViewSet):
    queryset = AttendanceSession.objects.select_related(
        "teacher_assignment",
        "teacher_assignment__teacher",
        "teacher_assignment__group",
        "teacher_assignment__group__grade",
        "teacher_assignment__academic_load",
        "teacher_assignment__academic_load__subject",
        "period",
        "period__academic_year",
    )
    serializer_class = AttendanceSessionSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = AttendanceSessionPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = [
        "starts_at",
        "class_date",
        "sequence",
        "locked_at",
        "created_at",
        "teacher_assignment__group__grade__name",
        "teacher_assignment__group__grade__ordinal",
        "teacher_assignment__group__name",
        "teacher_assignment__academic_load__subject__name",
    ]
    ordering = ["-starts_at", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if getattr(user, "role", None) == "TEACHER":
            # Teachers should not see sessions once they requested deletion.
            qs = qs.filter(teacher_assignment__teacher=user, deletion_requested_at__isnull=True)
        return qs

    def list(self, request, *args, **kwargs):
        # Ensure expired sessions show as closed even if the scheduler hasn't run yet.
        now = timezone.now()
        AttendanceSession.objects.filter(locked_at__isnull=True, starts_at__lte=now - timedelta(hours=1)).update(locked_at=now)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = AttendanceSessionCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        return Response(AttendanceSessionSerializer(session, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="pending-deletion")
    def pending_deletion(self, request):
        if not _is_admin_user(request.user):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        qs = (
            AttendanceSession.objects.select_related(
                "teacher_assignment",
                "teacher_assignment__teacher",
                "teacher_assignment__group",
                "teacher_assignment__group__grade",
                "teacher_assignment__academic_load",
                "teacher_assignment__academic_load__subject",
                "period",
            )
            .filter(deletion_requested_at__isnull=False)
            .order_by("-deletion_requested_at", "-id")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            ser = AttendanceSessionSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(ser.data)
        ser = AttendanceSessionSerializer(qs, many=True, context={"request": request})
        return Response(ser.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        session: AttendanceSession = self.get_object()
        user = request.user

        # Admins: definitive deletion, but only after a teacher requested it.
        if _is_admin_user(user):
            if session.deletion_requested_at is None:
                return Response(
                    {"detail": "Esta planilla no tiene solicitud de eliminación pendiente."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            session.deletion_approved_at = now
            session.deletion_approved_by = user
            session.save(update_fields=["deletion_approved_at", "deletion_approved_by", "updated_at"])
            session.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Teachers: request deletion (deactivate for teacher) + notify admins.
        if getattr(user, "role", None) == User.ROLE_TEACHER:
            if not _user_can_access_session(user, session):
                return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

            if session.deletion_requested_at is not None:
                return Response(
                    {"detail": "Ya existe una solicitud de eliminación para esta planilla."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            if session.locked_at is None:
                session.locked_at = now
            session.deletion_requested_at = now
            session.deletion_requested_by = user
            session.save(update_fields=["locked_at", "deletion_requested_at", "deletion_requested_by", "updated_at"])

            try:
                group_label = ""
                subject_label = ""
                ta = session.teacher_assignment
                try:
                    g = getattr(ta, "group", None)
                    grade = getattr(getattr(g, "grade", None), "name", "") or ""
                    name = getattr(g, "name", "") or ""
                    group_label = (f"{grade} {name}").strip() if (grade or name) else ""
                except Exception:
                    group_label = ""

                try:
                    al = getattr(ta, "academic_load", None)
                    subj = getattr(al, "subject", None)
                    subject_label = getattr(subj, "name", "") or ""
                except Exception:
                    subject_label = ""

                teacher_name = user.get_full_name() or getattr(user, "username", "")
                title = "Solicitud de eliminación de planilla de asistencia"
                body = f"El docente {teacher_name} solicitó eliminar la planilla #{session.id} ({session.class_date})."
                extra = ", ".join([p for p in [group_label, subject_label] if p])
                if extra:
                    body += f" [{extra}]"

                notify_users(
                    recipients=admin_like_users_qs().filter(role__in=[User.ROLE_ADMIN, User.ROLE_SUPERADMIN]),
                    title=title,
                    body=body,
                    url=f"/attendance/sessions/{session.id}",
                    type="ATTENDANCE_DELETE_REQUEST",
                    dedupe_key=f"ATTENDANCE_DELETE_REQUEST:session={session.id}",
                    dedupe_within_seconds=3600,
                )
            except Exception:
                # Notifications are best-effort; do not block the request.
                pass

            return Response(
                {"detail": "Solicitud enviada al administrador. La planilla quedó desactivada para el docente."},
                status=status.HTTP_202_ACCEPTED,
            )

        return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=["get"], url_path="roster")
    def roster(self, request, pk=None):
        session = self.get_object()
        session = _auto_close_if_expired(session)
        if not _user_can_access_session(request.user, session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        ta: TeacherAssignment = session.teacher_assignment

        enrollments = (
            Enrollment.objects.select_related("student", "student__user")
            .filter(academic_year_id=ta.academic_year_id, group_id=ta.group_id, status="ACTIVE")
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )

        records = AttendanceRecord.objects.filter(session=session, enrollment__in=enrollments).select_related(
            "enrollment", "enrollment__student", "enrollment__student__user"
        )
        records_by_enrollment = {r.enrollment_id: r for r in records}

        students_payload = []
        for e in enrollments:
            r = records_by_enrollment.get(e.id)

            photo_url = None
            try:
                photo = getattr(e.student, "photo_thumb", None) or getattr(e.student, "photo", None)
                if photo and getattr(photo, "url", None):
                    photo_url = request.build_absolute_uri(photo.url)
            except Exception:
                photo_url = None

            students_payload.append(
                {
                    "enrollment_id": e.id,
                    "student_full_name": e.student.user.get_full_name(),
                    "student_photo_url": photo_url,
                    "status": r.status if r else None,
                    "tardy_at": r.tardy_at if r else None,
                    "excuse_reason": r.excuse_reason if r else "",
                    "record_id": r.id if r else None,
                }
            )

        return Response(
            {
                "session": AttendanceSessionSerializer(session, context={"request": request}).data,
                "students": students_payload,
            }
        )

    @action(detail=True, methods=["post"], url_path="bulk-mark")
    def bulk_mark(self, request, pk=None):
        session = self.get_object()
        session = _auto_close_if_expired(session)
        if not _user_can_access_session(request.user, session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if session.locked_at:
            return Response({"detail": "La clase está cerrada y no permite ediciones."}, status=status.HTTP_409_CONFLICT)

        serializer = AttendanceBulkMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ta: TeacherAssignment = session.teacher_assignment
        now = timezone.now()

        # Validate enrollments belong to this class group/year.
        enrollment_ids = [int(item["enrollment_id"]) for item in serializer.validated_data["records"]]
        allowed = set(
            Enrollment.objects.filter(
                id__in=enrollment_ids,
                academic_year_id=ta.academic_year_id,
                group_id=ta.group_id,
            ).values_list("id", flat=True)
        )

        to_upsert = []
        errors = []
        for item in serializer.validated_data["records"]:
            enrollment_id = int(item["enrollment_id"])
            if enrollment_id not in allowed:
                errors.append({"enrollment_id": enrollment_id, "detail": "Matrícula no pertenece a este grupo/año."})
                continue

            status_value = item["status"]
            excuse_reason = item.get("excuse_reason")

            if status_value == AttendanceRecord.STATUS_EXCUSED and not (excuse_reason or "").strip():
                errors.append({"enrollment_id": enrollment_id, "detail": "EXCUSED requiere motivo (o adjuntar soporte por aparte)."})
                continue

            rec, _ = AttendanceRecord.objects.get_or_create(session=session, enrollment_id=enrollment_id)
            rec.apply_status(status=status_value, user=request.user, now=now, excuse_reason=excuse_reason)
            to_upsert.append(rec)

        if errors:
            return Response({"detail": "Errores de validación", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if to_upsert:
                AttendanceRecord.objects.bulk_update(
                    to_upsert,
                    fields=["status", "tardy_at", "excuse_reason", "marked_by", "updated_at"],
                )

        out = AttendanceRecord.objects.filter(session=session, enrollment_id__in=enrollment_ids).select_related(
            "enrollment", "enrollment__student", "enrollment__student__user"
        )
        return Response({"updated": len(to_upsert), "records": AttendanceRecordSerializer(out, many=True, context={"request": request}).data})

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        session = self.get_object()
        session = _auto_close_if_expired(session)
        if not _user_can_access_session(request.user, session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if session.locked_at:
            return Response({"detail": "La clase ya está cerrada."}, status=status.HTTP_200_OK)

        session.locked_at = timezone.now()
        session.save(update_fields=["locked_at", "updated_at"])
        return Response({"locked_at": session.locked_at})


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related(
        "session",
        "session__teacher_assignment",
        "session__teacher_assignment__teacher",
        "enrollment",
        "enrollment__student",
        "enrollment__student__user",
    )
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if getattr(user, "role", None) == "TEACHER":
            qs = qs.filter(session__teacher_assignment__teacher=user, session__deletion_requested_at__isnull=True)
        return qs

    @action(detail=True, methods=["post"], url_path="mark-tardy-now")
    def mark_tardy_now(self, request, pk=None):
        record = self.get_object()
        _auto_close_if_expired(record.session)
        if not _user_can_access_session(request.user, record.session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if record.session.locked_at:
            return Response({"detail": "La clase está cerrada y no permite ediciones."}, status=status.HTTP_409_CONFLICT)

        serializer = AttendanceMarkTardySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        enrollment_id = int(serializer.validated_data["enrollment_id"])
        if enrollment_id != record.enrollment_id:
            return Response({"detail": "El enrollment_id no coincide con el registro."}, status=status.HTTP_400_BAD_REQUEST)

        record.apply_status(status=AttendanceRecord.STATUS_TARDY, user=request.user, now=timezone.now())
        record.save(update_fields=["status", "tardy_at", "marked_by", "updated_at"])
        return Response(AttendanceRecordSerializer(record, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="attach-excuse", parser_classes=[MultiPartParser, FormParser])
    def attach_excuse(self, request, pk=None):
        record = self.get_object()
        _auto_close_if_expired(record.session)
        if not _user_can_access_session(request.user, record.session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if record.session.locked_at:
            return Response({"detail": "La clase está cerrada y no permite ediciones."}, status=status.HTTP_409_CONFLICT)

        serializer = AttendanceAttachExcuseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        excuse_reason = (serializer.validated_data.get("excuse_reason") or "").strip()
        excuse_attachment = serializer.validated_data.get("excuse_attachment")

        if not excuse_reason and not excuse_attachment:
            return Response({"detail": "La excusa requiere un motivo o un soporte adjunto."}, status=status.HTTP_400_BAD_REQUEST)

        record.status = AttendanceRecord.STATUS_EXCUSED
        record.excuse_reason = excuse_reason
        if excuse_attachment:
            record.excuse_attachment = excuse_attachment

        record.marked_by = request.user
        record.tardy_at = None
        record.save(update_fields=["status", "excuse_reason", "excuse_attachment", "marked_by", "tardy_at", "updated_at"])

        return Response(AttendanceRecordSerializer(record, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="excuse-attachment")
    def excuse_attachment(self, request, pk=None):
        record = self.get_object()
        _auto_close_if_expired(record.session)
        if not _user_can_access_session(request.user, record.session):
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        if not record.excuse_attachment:
            return Response({"detail": "No hay soporte adjunto."}, status=status.HTTP_404_NOT_FOUND)

        f = record.excuse_attachment
        try:
            resp = FileResponse(f.open("rb"), as_attachment=True, filename=f.name.split("/")[-1])
        except Exception:
            # Fallback for storages without open.
            resp = FileResponse(f, as_attachment=True, filename=f.name.split("/")[-1])
        return resp


class AttendanceStudentStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        teacher_assignment_id = request.query_params.get("teacher_assignment")
        period_id = request.query_params.get("period")

        if not teacher_assignment_id or not period_id:
            return Response(
                {"detail": "Parámetros requeridos: teacher_assignment y period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher_assignment_id = int(teacher_assignment_id)
            period_id = int(period_id)
        except (TypeError, ValueError):
            return Response({"detail": "Parámetros inválidos."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ta = TeacherAssignment.objects.select_related(
                "group",
                "academic_year",
                "academic_load",
                "academic_load__subject",
            ).get(pk=teacher_assignment_id)
        except TeacherAssignment.DoesNotExist:
            return Response({"detail": "Asignación no existe."}, status=status.HTTP_404_NOT_FOUND)

        try:
            period = Period.objects.select_related("academic_year").get(pk=period_id)
        except Period.DoesNotExist:
            return Response({"detail": "Periodo no existe."}, status=status.HTTP_404_NOT_FOUND)

        if ta.academic_year_id != period.academic_year_id:
            return Response(
                {"detail": "La asignación y el periodo deben pertenecer al mismo año académico."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        if getattr(user, "role", None) == "TEACHER" and ta.teacher_id != user.id:
            return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        enrollments = (
            Enrollment.objects.select_related("student", "student__user")
            .filter(
                academic_year_id=ta.academic_year_id,
                group_id=ta.group_id,
                status="ACTIVE",
            )
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )

        base = Q(
            attendance_records__session__teacher_assignment_id=ta.id,
            attendance_records__session__period_id=period.id,
        )

        enrollments = enrollments.annotate(
            absences=Count(
                "attendance_records",
                filter=base & Q(attendance_records__status=AttendanceRecord.STATUS_ABSENT),
                distinct=True,
            ),
            tardies=Count(
                "attendance_records",
                filter=base & Q(attendance_records__status=AttendanceRecord.STATUS_TARDY),
                distinct=True,
            ),
            excused=Count(
                "attendance_records",
                filter=base & Q(attendance_records__status=AttendanceRecord.STATUS_EXCUSED),
                distinct=True,
            ),
            present=Count(
                "attendance_records",
                filter=base & Q(attendance_records__status=AttendanceRecord.STATUS_PRESENT),
                distinct=True,
            ),
        )

        sessions_count = AttendanceSession.objects.filter(teacher_assignment=ta, period=period).count()

        students = []
        for e in enrollments:
            students.append(
                {
                    "enrollment_id": e.id,
                    "student_full_name": e.student.user.get_full_name(),
                    "absences": int(getattr(e, "absences", 0) or 0),
                    "tardies": int(getattr(e, "tardies", 0) or 0),
                    "excused": int(getattr(e, "excused", 0) or 0),
                    "present": int(getattr(e, "present", 0) or 0),
                }
            )

        return Response(
            {
                "teacher_assignment": {
                    "id": ta.id,
                    "group_id": ta.group_id,
                    "group_name": getattr(ta.group, "name", ""),
                    "grade_name": getattr(getattr(getattr(ta, "group", None), "grade", None), "name", ""),
                    "subject_name": getattr(getattr(getattr(ta, "academic_load", None), "subject", None), "name", "") or "",
                },
                "period": {"id": period.id, "name": period.name},
                "sessions_count": sessions_count,
                "students": students,
            }
        )


class AttendanceKpiDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_date(value: str | None, *, fallback: date) -> date:
        if not value:
            return fallback
        return date.fromisoformat(value)

    @staticmethod
    def _safe_int(value: str | None) -> int | None:
        if value in (None, ""):
            return None
        return int(value)

    def get(self, request):
        today = timezone.localdate()
        default_start = today - timedelta(days=30)

        try:
            start_date = self._parse_date(request.query_params.get("start_date"), fallback=default_start)
            end_date = self._parse_date(request.query_params.get("end_date"), fallback=today)
            grade_id = self._safe_int(request.query_params.get("grade_id"))
            group_id = self._safe_int(request.query_params.get("group_id"))
            teacher_id = self._safe_int(request.query_params.get("teacher_id"))
            area_id = self._safe_int(request.query_params.get("area_id"))
        except ValueError:
            return Response({"detail": "Parámetros inválidos."}, status=status.HTTP_400_BAD_REQUEST)

        if start_date > end_date:
            return Response({"detail": "start_date debe ser menor o igual a end_date."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if getattr(user, "role", None) == User.ROLE_TEACHER:
            teacher_id = user.id

        def build_sessions_queryset(range_start: date, range_end: date):
            sessions_qs = AttendanceSession.objects.select_related(
                "teacher_assignment",
                "teacher_assignment__group",
                "teacher_assignment__group__grade",
                "teacher_assignment__academic_load",
                "teacher_assignment__academic_load__subject",
                "teacher_assignment__academic_load__subject__area",
                "teacher_assignment__teacher",
            ).filter(
                class_date__gte=range_start,
                class_date__lte=range_end,
            )

            if grade_id:
                sessions_qs = sessions_qs.filter(teacher_assignment__group__grade_id=grade_id)
            if group_id:
                sessions_qs = sessions_qs.filter(teacher_assignment__group_id=group_id)
            if teacher_id:
                sessions_qs = sessions_qs.filter(teacher_assignment__teacher_id=teacher_id)
            if area_id:
                sessions_qs = sessions_qs.filter(teacher_assignment__academic_load__subject__area_id=area_id)
            return sessions_qs

        sessions = build_sessions_queryset(start_date, end_date)

        records = AttendanceRecord.objects.filter(session__in=sessions)

        totals = records.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
            absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
            tardy=Count("id", filter=Q(status=AttendanceRecord.STATUS_TARDY)),
            excused=Count("id", filter=Q(status=AttendanceRecord.STATUS_EXCUSED)),
        )

        total_records = int(totals.get("total") or 0)

        def pct(value: int, total: int) -> float:
            if total <= 0:
                return 0.0
            return round((float(value) * 100.0) / float(total), 2)

        present = int(totals.get("present") or 0)
        absent = int(totals.get("absent") or 0)
        tardy = int(totals.get("tardy") or 0)
        excused = int(totals.get("excused") or 0)

        sessions_total = sessions.count()

        expected_count_subquery = (
            Enrollment.objects.filter(
                academic_year_id=OuterRef("teacher_assignment__academic_year_id"),
                group_id=OuterRef("teacher_assignment__group_id"),
                status="ACTIVE",
            )
            .values("group_id")
            .annotate(c=Count("id"))
            .values("c")[:1]
        )

        session_rows = sessions.annotate(
            recorded_count=Count("records", distinct=True),
            expected_count=Subquery(expected_count_subquery),
        ).values("id", "recorded_count", "expected_count")

        complete_sessions = 0
        for row in session_rows:
            expected = int(row.get("expected_count") or 0)
            recorded = int(row.get("recorded_count") or 0)
            if expected > 0 and recorded >= expected:
                complete_sessions += 1

        range_days = (end_date - start_date).days + 1
        previous_end_date = start_date - timedelta(days=1)
        previous_start_date = previous_end_date - timedelta(days=max(range_days - 1, 0))

        previous_sessions = build_sessions_queryset(previous_start_date, previous_end_date)
        previous_records = AttendanceRecord.objects.filter(session__in=previous_sessions)

        previous_totals = previous_records.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
            absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
            tardy=Count("id", filter=Q(status=AttendanceRecord.STATUS_TARDY)),
            excused=Count("id", filter=Q(status=AttendanceRecord.STATUS_EXCUSED)),
        )

        previous_total_records = int(previous_totals.get("total") or 0)
        previous_present = int(previous_totals.get("present") or 0)
        previous_absent = int(previous_totals.get("absent") or 0)
        previous_tardy = int(previous_totals.get("tardy") or 0)
        previous_excused = int(previous_totals.get("excused") or 0)
        previous_sessions_total = previous_sessions.count()

        previous_session_rows = previous_sessions.annotate(
            recorded_count=Count("records", distinct=True),
            expected_count=Subquery(expected_count_subquery),
        ).values("id", "recorded_count", "expected_count")

        previous_complete_sessions = 0
        for row in previous_session_rows:
            expected = int(row.get("expected_count") or 0)
            recorded = int(row.get("recorded_count") or 0)
            if expected > 0 and recorded >= expected:
                previous_complete_sessions += 1

        records_by_group = (
            records.values(
                "session__teacher_assignment__group_id",
                "session__teacher_assignment__group__name",
                "session__teacher_assignment__group__grade__name",
            )
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
                absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
                tardy=Count("id", filter=Q(status=AttendanceRecord.STATUS_TARDY)),
                excused=Count("id", filter=Q(status=AttendanceRecord.STATUS_EXCUSED)),
            )
            .order_by()
        )

        previous_records_by_group = (
            previous_records.values("session__teacher_assignment__group_id")
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
            )
            .order_by()
        )

        previous_group_rate_map: dict[int, float] = {}
        for row in previous_records_by_group:
            prev_group_id = int(row.get("session__teacher_assignment__group_id") or 0)
            prev_total = int(row.get("total") or 0)
            prev_present = int(row.get("present") or 0)
            previous_group_rate_map[prev_group_id] = pct(prev_present, prev_total)

        institutional_attendance_rate = pct(present, total_records)
        previous_institutional_attendance_rate = pct(previous_present, previous_total_records)
        group_comparison = []
        for row in records_by_group:
            group_name = (row.get("session__teacher_assignment__group__name") or "").strip()
            if not group_name:
                continue

            group_total = int(row.get("total") or 0)
            group_present = int(row.get("present") or 0)
            group_absent = int(row.get("absent") or 0)
            group_id_value = int(row.get("session__teacher_assignment__group_id") or 0)
            group_rate = pct(group_present, group_total)
            gap = round(group_rate - institutional_attendance_rate, 2)
            previous_group_rate = previous_group_rate_map.get(group_id_value, 0.0)
            group_comparison.append(
                {
                    "group_id": group_id_value,
                    "group_name": group_name,
                    "grade_name": row.get("session__teacher_assignment__group__grade__name") or "",
                    "attendance_rate": group_rate,
                    "attendance_rate_delta": round(group_rate - previous_group_rate, 2),
                    "absences": group_absent,
                    "tardies": int(row.get("tardy") or 0),
                    "excused": int(row.get("excused") or 0),
                    "total_records": group_total,
                    "gap_vs_institution": gap,
                }
            )

        group_comparison.sort(key=lambda item: (-item["absences"], item["attendance_rate"]))

        risk_rows = (
            records.values(
                "enrollment_id",
                "enrollment__student__user__first_name",
                "enrollment__student__user__last_name",
                "enrollment__group__name",
                "enrollment__grade__name",
            )
            .annotate(
                total=Count("id"),
                absences=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
                tardies=Count("id", filter=Q(status=AttendanceRecord.STATUS_TARDY)),
                excused=Count("id", filter=Q(status=AttendanceRecord.STATUS_EXCUSED)),
                present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
            )
            .order_by()
        )

        student_risk = []
        for row in risk_rows:
            absences_i = int(row.get("absences") or 0)
            tardies_i = int(row.get("tardies") or 0)
            total_i = int(row.get("total") or 0)
            risk_score = absences_i * 2 + tardies_i
            absence_rate = pct(absences_i, total_i)

            if risk_score >= 6 or absence_rate >= 30:
                risk_level = "HIGH"
            elif risk_score >= 3 or absence_rate >= 15:
                risk_level = "MEDIUM"
            else:
                risk_level = "LOW"

            first_name = (row.get("enrollment__student__user__first_name") or "").strip()
            last_name = (row.get("enrollment__student__user__last_name") or "").strip()
            full_name = f"{first_name} {last_name}".strip()

            student_risk.append(
                {
                    "enrollment_id": row.get("enrollment_id"),
                    "student_full_name": full_name,
                    "grade_name": row.get("enrollment__grade__name") or "",
                    "group_name": row.get("enrollment__group__name") or "",
                    "absences": absences_i,
                    "tardies": tardies_i,
                    "excused": int(row.get("excused") or 0),
                    "present": int(row.get("present") or 0),
                    "total_records": total_i,
                    "absence_rate": absence_rate,
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                }
            )

        student_risk.sort(key=lambda item: (-item["risk_score"], -item["absence_rate"]))

        trend_rows = (
            records.values("session__class_date")
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
                absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
            )
            .order_by("session__class_date")
        )

        previous_trend_rows = (
            previous_records.values("session__class_date")
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
                absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
            )
            .order_by("session__class_date")
        )

        previous_trend_rates = []
        previous_trend = []
        for row in previous_trend_rows:
            total_i = int(row.get("total") or 0)
            rate_i = pct(int(row.get("present") or 0), total_i)
            previous_trend_rates.append(rate_i)
            previous_trend.append(
                {
                    "date": row.get("session__class_date"),
                    "attendance_rate": rate_i,
                    "absences": int(row.get("absent") or 0),
                    "total_records": total_i,
                }
            )

        trend = []
        for idx, row in enumerate(trend_rows):
            total_i = int(row.get("total") or 0)
            current_rate = pct(int(row.get("present") or 0), total_i)
            previous_rate = previous_trend_rates[idx] if idx < len(previous_trend_rates) else None
            trend.append(
                {
                    "date": row.get("session__class_date"),
                    "attendance_rate": current_rate,
                    "previous_attendance_rate": previous_rate,
                    "attendance_rate_delta": round(current_rate - previous_rate, 2) if previous_rate is not None else None,
                    "absences": int(row.get("absent") or 0),
                    "total_records": total_i,
                }
            )

        return Response(
            {
                "filters": {
                    "start_date": start_date,
                    "end_date": end_date,
                    "grade_id": grade_id,
                    "group_id": group_id,
                    "teacher_id": teacher_id,
                    "area_id": area_id,
                },
                "summary": {
                    "sessions_count": sessions_total,
                    "total_records": total_records,
                    "present": present,
                    "absent": absent,
                    "tardy": tardy,
                    "excused": excused,
                    "attendance_rate": pct(present, total_records),
                    "absence_rate": pct(absent, total_records),
                    "tardy_rate": pct(tardy, total_records),
                    "excused_rate": pct(excused, total_records),
                    "coverage_rate": pct(complete_sessions, sessions_total),
                },
                "previous_period": {
                    "start_date": previous_start_date,
                    "end_date": previous_end_date,
                },
                "previous_summary": {
                    "sessions_count": previous_sessions_total,
                    "total_records": previous_total_records,
                    "present": previous_present,
                    "absent": previous_absent,
                    "tardy": previous_tardy,
                    "excused": previous_excused,
                    "attendance_rate": previous_institutional_attendance_rate,
                    "absence_rate": pct(previous_absent, previous_total_records),
                    "tardy_rate": pct(previous_tardy, previous_total_records),
                    "excused_rate": pct(previous_excused, previous_total_records),
                    "coverage_rate": pct(previous_complete_sessions, previous_sessions_total),
                },
                "summary_delta": {
                    "attendance_rate_delta": round(pct(present, total_records) - previous_institutional_attendance_rate, 2),
                    "absence_rate_delta": round(pct(absent, total_records) - pct(previous_absent, previous_total_records), 2),
                    "tardy_rate_delta": round(pct(tardy, total_records) - pct(previous_tardy, previous_total_records), 2),
                    "excused_rate_delta": round(pct(excused, total_records) - pct(previous_excused, previous_total_records), 2),
                    "coverage_rate_delta": round(pct(complete_sessions, sessions_total) - pct(previous_complete_sessions, previous_sessions_total), 2),
                },
                "group_comparison": group_comparison[:10],
                "student_risk": student_risk[:20],
                "trend": trend,
                "previous_trend": previous_trend,
            }
        )


class AttendanceKpiStudentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _parse_date(value: str | None, *, fallback: date) -> date:
        if not value:
            return fallback
        return date.fromisoformat(value)

    @staticmethod
    def _safe_int(value: str | None) -> int | None:
        if value in (None, ""):
            return None
        return int(value)

    def get(self, request):
        today = timezone.localdate()
        default_start = today - timedelta(days=30)

        try:
            enrollment_id = int(request.query_params.get("enrollment_id") or "")
            start_date = self._parse_date(request.query_params.get("start_date"), fallback=default_start)
            end_date = self._parse_date(request.query_params.get("end_date"), fallback=today)
            grade_id = self._safe_int(request.query_params.get("grade_id"))
            group_id = self._safe_int(request.query_params.get("group_id"))
            teacher_id = self._safe_int(request.query_params.get("teacher_id"))
            area_id = self._safe_int(request.query_params.get("area_id"))
        except ValueError:
            return Response({"detail": "Parámetros inválidos."}, status=status.HTTP_400_BAD_REQUEST)

        if start_date > end_date:
            return Response({"detail": "start_date debe ser menor o igual a end_date."}, status=status.HTTP_400_BAD_REQUEST)

        enrollment = Enrollment.objects.select_related("student__user", "grade", "group").filter(id=enrollment_id).first()
        if not enrollment:
            return Response({"detail": "Matrícula no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if getattr(user, "role", None) == User.ROLE_TEACHER:
            teacher_id = user.id
            if not TeacherAssignment.objects.filter(teacher_id=user.id, group_id=enrollment.group_id).exists():
                return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        sessions = AttendanceSession.objects.select_related(
            "teacher_assignment",
            "teacher_assignment__group",
            "teacher_assignment__group__grade",
            "teacher_assignment__academic_load",
            "teacher_assignment__academic_load__subject",
            "teacher_assignment__academic_load__subject__area",
            "teacher_assignment__teacher",
        ).filter(
            class_date__gte=start_date,
            class_date__lte=end_date,
        )

        if grade_id:
            sessions = sessions.filter(teacher_assignment__group__grade_id=grade_id)
        if group_id:
            sessions = sessions.filter(teacher_assignment__group_id=group_id)
        if teacher_id:
            sessions = sessions.filter(teacher_assignment__teacher_id=teacher_id)
        if area_id:
            sessions = sessions.filter(teacher_assignment__academic_load__subject__area_id=area_id)

        records = AttendanceRecord.objects.filter(session__in=sessions, enrollment_id=enrollment_id)

        totals = records.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status=AttendanceRecord.STATUS_PRESENT)),
            absent=Count("id", filter=Q(status=AttendanceRecord.STATUS_ABSENT)),
            tardy=Count("id", filter=Q(status=AttendanceRecord.STATUS_TARDY)),
            excused=Count("id", filter=Q(status=AttendanceRecord.STATUS_EXCUSED)),
        )

        total_records = int(totals.get("total") or 0)

        def pct(value: int, total: int) -> float:
            if total <= 0:
                return 0.0
            return round((float(value) * 100.0) / float(total), 2)

        present = int(totals.get("present") or 0)
        absent = int(totals.get("absent") or 0)
        tardy = int(totals.get("tardy") or 0)
        excused = int(totals.get("excused") or 0)

        timeline_rows = (
            records.values("session__class_date", "status")
            .annotate(count=Count("id"))
            .order_by("session__class_date", "status")
        )

        subject_rows = (
            records.values(
                "session__teacher_assignment__academic_load__subject__name",
                "status",
            )
            .annotate(count=Count("id"))
            .order_by("session__teacher_assignment__academic_load__subject__name", "status")
        )

        timeline_map: dict[date, dict[str, int]] = {}
        for row in timeline_rows:
            row_date = row.get("session__class_date")
            if not row_date:
                continue
            if row_date not in timeline_map:
                timeline_map[row_date] = {
                    "PRESENT": 0,
                    "ABSENT": 0,
                    "TARDY": 0,
                    "EXCUSED": 0,
                }
            timeline_map[row_date][row.get("status") or "PRESENT"] = int(row.get("count") or 0)

        timeline = []
        for row_date in sorted(timeline_map.keys()):
            day = timeline_map[row_date]
            day_total = int(day["PRESENT"] + day["ABSENT"] + day["TARDY"] + day["EXCUSED"])
            timeline.append(
                {
                    "date": row_date,
                    "present": day["PRESENT"],
                    "absent": day["ABSENT"],
                    "tardy": day["TARDY"],
                    "excused": day["EXCUSED"],
                    "attendance_rate": pct(day["PRESENT"], day_total),
                }
            )

        by_subject_map: dict[str, dict[str, int]] = {}
        for row in subject_rows:
            subject_name = (row.get("session__teacher_assignment__academic_load__subject__name") or "Sin asignatura").strip() or "Sin asignatura"
            if subject_name not in by_subject_map:
                by_subject_map[subject_name] = {
                    "PRESENT": 0,
                    "ABSENT": 0,
                    "TARDY": 0,
                    "EXCUSED": 0,
                }
            by_subject_map[subject_name][row.get("status") or "PRESENT"] = int(row.get("count") or 0)

        by_subject = []
        for subject_name in sorted(by_subject_map.keys()):
            row = by_subject_map[subject_name]
            subject_total = int(row["PRESENT"] + row["ABSENT"] + row["TARDY"] + row["EXCUSED"])
            by_subject.append(
                {
                    "subject_name": subject_name,
                    "present": row["PRESENT"],
                    "absent": row["ABSENT"],
                    "tardy": row["TARDY"],
                    "excused": row["EXCUSED"],
                    "total_records": subject_total,
                    "absence_rate": pct(row["ABSENT"], subject_total),
                }
            )

        by_subject.sort(key=lambda item: (-item["absence_rate"], item["subject_name"]))

        student_user = enrollment.student.user
        student_name = (student_user.get_full_name() or "").strip() or student_user.username

        return Response(
            {
                "student": {
                    "enrollment_id": enrollment.id,
                    "student_full_name": student_name,
                    "grade_name": getattr(enrollment.grade, "name", "") or "",
                    "group_name": getattr(enrollment.group, "name", "") or "",
                },
                "filters": {
                    "start_date": start_date,
                    "end_date": end_date,
                    "grade_id": grade_id,
                    "group_id": group_id,
                    "teacher_id": teacher_id,
                    "area_id": area_id,
                },
                "summary": {
                    "total_records": total_records,
                    "present": present,
                    "absent": absent,
                    "tardy": tardy,
                    "excused": excused,
                    "attendance_rate": pct(present, total_records),
                    "absence_rate": pct(absent, total_records),
                },
                "by_subject": by_subject,
                "timeline": timeline,
            }
        )
