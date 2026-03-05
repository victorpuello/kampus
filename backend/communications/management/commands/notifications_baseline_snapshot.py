from __future__ import annotations

import json
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from communications.models import EmailDelivery, WhatsAppDelivery, WhatsAppTemplateMap
from notifications.models import Notification, NotificationDispatch


def build_notifications_baseline_snapshot(*, hours: int = 24, types_days: int = 30) -> dict:
    hours = max(1, int(hours))
    types_days = max(1, int(types_days))

    now = timezone.now()
    since_channels = now - timedelta(hours=hours)
    since_types = now - timedelta(days=types_days)

    wa_qs = WhatsAppDelivery.objects.filter(created_at__gte=since_channels)
    wa_sent = wa_qs.filter(status=WhatsAppDelivery.STATUS_SENT).count()
    wa_delivered = wa_qs.filter(status=WhatsAppDelivery.STATUS_DELIVERED).count()
    wa_read = wa_qs.filter(status=WhatsAppDelivery.STATUS_READ).count()
    wa_failed = wa_qs.filter(status=WhatsAppDelivery.STATUS_FAILED).count()
    wa_suppressed = wa_qs.filter(status=WhatsAppDelivery.STATUS_SUPPRESSED).count()
    wa_skipped = wa_qs.filter(status=WhatsAppDelivery.STATUS_SKIPPED).count()

    wa_attempts = wa_sent + wa_delivered + wa_read + wa_failed
    wa_delivered_read_rate = ((wa_delivered + wa_read) / wa_attempts * 100.0) if wa_attempts else 100.0

    top_wa_error_codes = list(
        wa_qs.filter(status=WhatsAppDelivery.STATUS_FAILED)
        .values("error_code")
        .annotate(total=Count("id"))
        .order_by("-total")[:10]
    )

    email_qs = EmailDelivery.objects.filter(created_at__gte=since_channels)
    email_sent = email_qs.filter(status=EmailDelivery.STATUS_SENT).count()
    email_failed = email_qs.filter(status=EmailDelivery.STATUS_FAILED).count()
    email_suppressed = email_qs.filter(status=EmailDelivery.STATUS_SUPPRESSED).count()
    email_attempts = email_sent + email_failed
    email_success_rate = (email_sent / email_attempts * 100.0) if email_attempts else 100.0

    top_types = list(
        Notification.objects.filter(created_at__gte=since_types)
        .exclude(type="")
        .values("type")
        .annotate(total=Count("id"))
        .order_by("-total")[:50]
    )
    active_mapped = {
        str(row).strip().upper()
        for row in WhatsAppTemplateMap.objects.filter(is_active=True).values_list("notification_type", flat=True)
    }

    missing_template_types = [
        {"notification_type": row["type"], "total": int(row["total"])}
        for row in top_types
        if str(row["type"]).strip().upper() not in active_mapped
    ]

    pending_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_PENDING)
    failed_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_FAILED)
    oldest_pending = pending_qs.order_by("created_at").values_list("created_at", flat=True).first()
    retry_ready_failed = failed_qs.filter(next_retry_at__lte=now).count()

    return {
        "generated_at": now.isoformat(),
        "window_hours": hours,
        "types_window_days": types_days,
        "whatsapp": {
            "sent": wa_sent,
            "delivered": wa_delivered,
            "read": wa_read,
            "failed": wa_failed,
            "suppressed": wa_suppressed,
            "skipped": wa_skipped,
            "delivered_read_rate_percent": round(wa_delivered_read_rate, 2),
            "top_error_codes": top_wa_error_codes,
        },
        "email": {
            "sent": email_sent,
            "failed": email_failed,
            "suppressed": email_suppressed,
            "success_rate_percent": round(email_success_rate, 2),
        },
        "notification_types": {
            "top_volume": [
                {"notification_type": row["type"], "total": int(row["total"])}
                for row in top_types
            ],
            "missing_whatsapp_template": missing_template_types,
            "missing_whatsapp_template_percent": round(
                (len(missing_template_types) / len(top_types) * 100.0) if top_types else 0.0,
                2,
            ),
        },
        "dispatch_outbox": {
            "pending": pending_qs.count(),
            "in_progress": NotificationDispatch.objects.filter(
                status=NotificationDispatch.STATUS_IN_PROGRESS
            ).count(),
            "failed": failed_qs.count(),
            "dead_letter": NotificationDispatch.objects.filter(
                status=NotificationDispatch.STATUS_DEAD_LETTER
            ).count(),
            "succeeded": NotificationDispatch.objects.filter(
                status=NotificationDispatch.STATUS_SUCCEEDED
            ).count(),
            "retry_ready_failed": retry_ready_failed,
            "oldest_pending_age_seconds": (
                max(0, int((now - oldest_pending).total_seconds())) if oldest_pending else None
            ),
        },
    }


class Command(BaseCommand):
    help = "Genera snapshot base de notificaciones por canal y cobertura de templates WhatsApp."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24, help="Ventana para metricas de canal.")
        parser.add_argument("--types-days", type=int, default=30, help="Ventana para cobertura de notification_type.")

    def handle(self, *args, **options):
        payload = build_notifications_baseline_snapshot(
            hours=int(options["hours"]),
            types_days=int(options["types_days"]),
        )

        self.stdout.write(json.dumps(payload, ensure_ascii=True, sort_keys=True, indent=2))
