from __future__ import annotations

import json
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from communications.models import EmailDelivery

from notifications.models import Notification


class Command(BaseCommand):
    help = "Reporta KPIs de notificaciones (in-app + email) para una ventana temporal."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            dest="hours",
            type=int,
            default=24,
            help="Ventana de análisis en horas (default: 24).",
        )
        parser.add_argument(
            "--format",
            dest="output_format",
            choices=["text", "json"],
            default="text",
            help="Formato de salida: text o json (default: text).",
        )

    def handle(self, *args, **options):
        hours = max(1, int(options["hours"]))
        output_format = str(options["output_format"])
        now = timezone.now()
        since = now - timedelta(hours=hours)

        notifications_qs = Notification.objects.filter(created_at__gte=since)
        unread_count = notifications_qs.filter(read_at__isnull=True).count()

        email_qs = EmailDelivery.objects.filter(created_at__gte=since)
        email_total = email_qs.count()
        sent_count = email_qs.filter(status=EmailDelivery.STATUS_SENT).count()
        failed_count = email_qs.filter(status=EmailDelivery.STATUS_FAILED).count()
        suppressed_count = email_qs.filter(status=EmailDelivery.STATUS_SUPPRESSED).count()
        pending_count = email_qs.filter(status=EmailDelivery.STATUS_PENDING).count()

        successful_attempts = sent_count
        failed_attempts = failed_count
        attempted = successful_attempts + failed_attempts
        success_rate = round((successful_attempts / attempted) * 100, 2) if attempted else None

        suppression_rate = round((suppressed_count / email_total) * 100, 2) if email_total else None

        latencies = []
        for created_at, sent_at in email_qs.filter(
            status=EmailDelivery.STATUS_SENT,
            sent_at__isnull=False,
        ).values_list("created_at", "sent_at"):
            latencies.append(max((sent_at - created_at).total_seconds(), 0.0))

        avg_latency_seconds = round(sum(latencies) / len(latencies), 2) if latencies else None

        payload = {
            "window": {
                "hours": hours,
                "since": since.isoformat(),
                "until": now.isoformat(),
            },
            "in_app": {
                "total": notifications_qs.count(),
                "unread": unread_count,
                "read": max(notifications_qs.count() - unread_count, 0),
            },
            "email": {
                "total": email_total,
                "sent": sent_count,
                "failed": failed_count,
                "suppressed": suppressed_count,
                "pending": pending_count,
                "success_rate_percent": success_rate,
                "suppression_rate_percent": suppression_rate,
                "avg_send_latency_seconds": avg_latency_seconds,
                "open_rate_percent": None,
            },
        }

        if output_format == "json":
            self.stdout.write(json.dumps(payload, ensure_ascii=False, sort_keys=True))
            return

        self.stdout.write(f"Notifications KPIs ({hours}h)")
        self.stdout.write(
            f"In-app: total={payload['in_app']['total']} unread={payload['in_app']['unread']} read={payload['in_app']['read']}"
        )
        self.stdout.write(
            "Email: "
            f"total={email_total} sent={sent_count} failed={failed_count} "
            f"suppressed={suppressed_count} pending={pending_count}"
        )
        self.stdout.write(
            "Email ratios: "
            f"success_rate={success_rate if success_rate is not None else 'n/a'}% "
            f"suppression_rate={suppression_rate if suppression_rate is not None else 'n/a'}% "
            f"avg_latency={avg_latency_seconds if avg_latency_seconds is not None else 'n/a'}s"
        )
        self.stdout.write("Open rate: n/a (sin eventos de apertura integrados en esta versión).")
