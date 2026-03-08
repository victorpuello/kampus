from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.core.management import call_command
from django.db.models import Q
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Institution
from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html
from users.permissions import IsAdmin

from .models import Notification, OperationalPlanActivity
from .serializers import NotificationSerializer, OperationalPlanActivitySerializer


TEACHER_MOTIVATIONAL_FALLBACKS = [
    "Cada clase que preparas hoy abre una oportunidad real de transformación.",
    "Tu constancia en el aula construye el progreso que tus estudiantes necesitan.",
    "Enseñar con claridad y propósito hoy cambia la trayectoria de mañana.",
    "Tu liderazgo pedagógico convierte retos diarios en aprendizajes duraderos.",
]


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return Notification.objects.none()
        return Notification.objects.filter(recipient=user)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        return Response({"unread": qs.count()}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        obj: Notification = self.get_object()
        if obj.read_at is None:
            obj.read_at = timezone.now()
            obj.save(update_fields=["read_at"])
        return Response({"detail": "ok"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        now = timezone.now()
        updated = qs.update(read_at=now)
        return Response({"updated": updated}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="teacher-motivational-phrase")
    def teacher_motivational_phrase(self, request):
        user = request.user
        if getattr(user, "role", "") != "TEACHER":
            return Response({"detail": "Disponible solo para docentes."}, status=status.HTTP_403_FORBIDDEN)

        fallback_phrase = TEACHER_MOTIVATIONAL_FALLBACKS[(user.id or 0) % len(TEACHER_MOTIVATIONAL_FALLBACKS)]

        try:
            from academic.ai import AIService, AIServiceError

            ai = AIService()
            phrase = ai.generate_teacher_motivational_phrase(user.first_name or user.username)
            return Response({"phrase": phrase, "source": "ai"}, status=status.HTTP_200_OK)
        except Exception as exc:
            try:
                from academic.ai import AIServiceError
                if isinstance(exc, AIServiceError):
                    return Response({"phrase": fallback_phrase, "source": "fallback"}, status=status.HTTP_200_OK)
            except Exception:
                pass
            return Response({"phrase": fallback_phrase, "source": "fallback"}, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=["get"],
        url_path="admin-dashboard-summary",
        permission_classes=[IsAuthenticated, IsAdmin],
    )
    def admin_dashboard_summary(self, request):
        now = timezone.now()
        today = timezone.localdate()
        last_7_days = now - timedelta(days=7)
        last_30_days = now - timedelta(days=30)

        notifications_qs = Notification.objects.filter(recipient=request.user)
        unread_qs = notifications_qs.filter(read_at__isnull=True)

        unread_count = unread_qs.count()
        unread_last_7 = unread_qs.filter(created_at__gte=last_7_days).count()
        unread_last_30 = unread_qs.filter(created_at__gte=last_30_days).count()
        recent_unread = unread_qs.order_by("-created_at")[:5]

        operational_base_qs = OperationalPlanActivity.objects.filter(is_active=True)
        upcoming_30_qs = operational_base_qs.filter(
            activity_date__gte=today,
            activity_date__lte=today + timedelta(days=30),
        )
        upcoming_7_qs = operational_base_qs.filter(
            activity_date__gte=today,
            activity_date__lte=today + timedelta(days=7),
        )
        due_soon_qs = operational_base_qs.filter(
            activity_date__gte=today + timedelta(days=1),
            activity_date__lte=today + timedelta(days=3),
        )

        upcoming_items = (
            OperationalPlanActivity.objects
            .select_related("created_by", "updated_by")
            .prefetch_related("responsible_users")
            .filter(
                is_active=True,
                activity_date__lte=today + timedelta(days=30),
            )
            .filter(
                Q(end_date__isnull=True, activity_date__gte=today)
                | Q(end_date__isnull=False, end_date__gte=today)
            )
            .order_by("activity_date", "id")[:50]
        )

        return Response(
            {
                "notifications": {
                    "unread": unread_count,
                    "trend": {
                        "last7": unread_last_7,
                        "last30": unread_last_30,
                    },
                    "recent_unread": NotificationSerializer(recent_unread, many=True).data,
                },
                "operational_plan": {
                    "upcoming_7": upcoming_7_qs.count(),
                    "upcoming_30": upcoming_30_qs.count(),
                    "due_today": operational_base_qs.filter(activity_date=today).count(),
                    "due_1_3_days": due_soon_qs.count(),
                    "without_responsible": operational_base_qs.filter(responsible_users__isnull=True).distinct().count(),
                    "upcoming_items": OperationalPlanActivitySerializer(upcoming_items, many=True).data,
                },
            },
            status=status.HTTP_200_OK,
        )


class OperationalPlanActivityViewSet(viewsets.ModelViewSet):
    serializer_class = OperationalPlanActivitySerializer

    def get_queryset(self):
        return (
            OperationalPlanActivity.objects
            .select_related("created_by", "updated_by")
            .prefetch_related("responsible_users")
            .all()
            .order_by("activity_date", "id")
        )

    def get_permissions(self):
        if self.action in {"upcoming"}:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdmin()]

    def _compliance_queryset(self):
        return self.get_queryset().filter(is_active=True)

    def _build_compliance_summary(self):
        qs = self._compliance_queryset()
        total = qs.count()
        completed = qs.filter(is_completed=True).count()
        pending = max(0, total - completed)
        completion_rate = round((completed * 100.0 / total), 2) if total > 0 else 0.0
        return {
            "total": total,
            "completed": completed,
            "pending": pending,
            "completion_rate": completion_rate,
        }

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(updated_by=user)

    @action(detail=False, methods=["get"], url_path="upcoming")
    def upcoming(self, request):
        days_raw = str(request.query_params.get("days") or "30").strip()
        limit_raw = str(request.query_params.get("limit") or "20").strip()

        try:
            days = max(1, min(120, int(days_raw)))
        except (TypeError, ValueError):
            return Response({"detail": "days inválido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            limit = max(1, min(100, int(limit_raw)))
        except (TypeError, ValueError):
            return Response({"detail": "limit inválido"}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        end_date = today + timedelta(days=days)
        qs = self.get_queryset().filter(
            is_active=True,
            activity_date__lte=end_date,
        ).filter(
            Q(end_date__isnull=True, activity_date__gte=today)
            | Q(end_date__isnull=False, end_date__gte=today)
        )[:limit]
        data = OperationalPlanActivitySerializer(qs, many=True).data
        return Response({"results": data}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="map-responsibles")
    def map_responsibles(self, request):
        replace_existing = bool(request.data.get("replace_existing", True))
        output = StringIO()
        call_command(
            "map_operational_plan_responsibles",
            replace_existing=replace_existing,
            stdout=output,
            stderr=output,
        )
        return Response(
            {
                "detail": "Mapeo de responsables ejecutado.",
                "output": output.getvalue().strip(),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        return Response(self._build_compliance_summary(), status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-completed")
    def mark_completed(self, request, pk=None):
        activity: OperationalPlanActivity = self.get_object()
        user = request.user if request.user.is_authenticated else None
        notes = str(request.data.get("completion_notes") or "").strip()

        update_fields = ["is_completed", "completed_at", "completed_by", "updated_at"]
        activity.is_completed = True
        activity.completed_at = timezone.now()
        activity.completed_by = user
        if notes:
            activity.completion_notes = notes
            update_fields.append("completion_notes")
        activity.updated_by = user
        update_fields.append("updated_by")
        activity.save(update_fields=update_fields)

        return Response(
            OperationalPlanActivitySerializer(activity, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="mark-pending")
    def mark_pending(self, request, pk=None):
        activity: OperationalPlanActivity = self.get_object()
        user = request.user if request.user.is_authenticated else None

        activity.is_completed = False
        activity.completed_at = None
        activity.completed_by = None
        activity.completion_notes = ""
        activity.updated_by = user
        activity.save(update_fields=[
            "is_completed",
            "completed_at",
            "completed_by",
            "completion_notes",
            "updated_by",
            "updated_at",
        ])

        return Response(
            OperationalPlanActivitySerializer(activity, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="compliance-report-pdf")
    def compliance_report_pdf(self, request):
        institution = Institution.objects.first() or Institution(name="")
        activities = self._compliance_queryset().prefetch_related("responsible_users").order_by("activity_date", "id")
        summary = self._build_compliance_summary()

        generated_at = timezone.localtime(timezone.now())
        rows = []
        for activity in activities:
            responsibles = [
                (user.get_full_name() or user.username).strip()
                for user in activity.responsible_users.all()
            ]
            date_range_label = str(activity.activity_date)
            if activity.end_date and activity.end_date != activity.activity_date:
                date_range_label = f"{activity.activity_date} - {activity.end_date}"

            completed_by_name = ""
            if activity.completed_by_id:
                completed_by_name = activity.completed_by.get_full_name() or activity.completed_by.username

            rows.append(
                {
                    "title": activity.title,
                    "description": activity.description,
                    "date_range": date_range_label,
                    "responsibles": responsibles,
                    "is_completed": activity.is_completed,
                    "completed_at": timezone.localtime(activity.completed_at) if activity.completed_at else None,
                    "completed_by_name": completed_by_name,
                    "completion_notes": activity.completion_notes,
                }
            )

        html = render_to_string(
            "notifications/reports/operational_plan_compliance_pdf.html",
            {
                "institution": institution,
                "summary": summary,
                "rows": rows,
                "generated_at": generated_at,
            },
        )
        try:
            pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        except WeasyPrintUnavailableError:
            return Response(
                {
                    "detail": "No se puede generar PDF en este entorno. Instala dependencias de WeasyPrint.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            return Response(
                {
                    "detail": "No se pudo generar el reporte PDF de cumplimiento.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="plan_operativo_cumplimiento.pdf"'
        return response
