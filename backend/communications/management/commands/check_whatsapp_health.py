from __future__ import annotations

import os
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q
from django.utils import timezone

from communications.models import WhatsAppDelivery, WhatsAppInstitutionMetric
from notifications.services import admin_like_users_qs, notify_users


def _env_int(name: str, default: int) -> int:
    raw = ("" if name is None else str(os.getenv(name, "")).strip())
    if not raw:
        return int(default)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return int(default)


def _env_float(name: str, default: float) -> float:
    raw = ("" if name is None else str(os.getenv(name, "")).strip())
    if not raw:
        return float(default)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return float(default)


def _env_bool(name: str, default: bool) -> bool:
    raw = ("" if name is None else str(os.getenv(name, "")).strip().lower())
    if not raw:
        return bool(default)
    return raw in {"1", "true", "yes", "on"}


class Command(BaseCommand):
    help = "Evalua salud operativa del canal WhatsApp y dispara alerta si excede umbrales."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24, help="Ventana de analisis en horas (default: 24).")
        parser.add_argument(
            "--max-failed",
            type=int,
            default=_env_int("KAMPUS_WHATSAPP_ALERT_MAX_FAILED", 10),
            help="Maximo de entregas FAILED permitidas en la ventana.",
        )
        parser.add_argument(
            "--min-success-rate",
            type=float,
            default=_env_float("KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE", 90.0),
            help="Porcentaje minimo de exito sobre intentos.",
        )
        parser.add_argument(
            "--notify-admins",
            action="store_true",
            default=False,
            help="Crea notificacion in-app a roles administrativos cuando hay breach.",
        )
        parser.add_argument(
            "--fail-on-breach",
            action="store_true",
            default=False,
            help="Falla el comando con codigo no-cero cuando hay breach.",
        )
        parser.add_argument(
            "--no-fail-on-breach",
            action="store_true",
            default=False,
            help="Nunca falla el comando aunque haya breach.",
        )

    def handle(self, *args, **options):
        hours = max(1, int(options["hours"]))
        max_failed = max(0, int(options["max_failed"]))
        min_success_rate = float(options["min_success_rate"])
        notify_admins = bool(options["notify_admins"])

        default_fail = _env_bool("KAMPUS_WHATSAPP_ALERT_FAIL_ON_BREACH", bool(getattr(settings, "KAMPUS_WHATSAPP_ALERT_FAIL_ON_BREACH", False)))
        if bool(options["no_fail_on_breach"]):
            fail_on_breach = False
        elif bool(options["fail_on_breach"]):
            fail_on_breach = True
        else:
            fail_on_breach = default_fail

        now = timezone.now()
        since = now - timedelta(hours=hours)
        qs = WhatsAppDelivery.objects.filter(created_at__gte=since)

        total = qs.count()
        sent = qs.filter(status=WhatsAppDelivery.STATUS_SENT).count()
        delivered = qs.filter(status=WhatsAppDelivery.STATUS_DELIVERED).count()
        read = qs.filter(status=WhatsAppDelivery.STATUS_READ).count()
        failed = qs.filter(status=WhatsAppDelivery.STATUS_FAILED).count()
        suppressed = qs.filter(status=WhatsAppDelivery.STATUS_SUPPRESSED).count()

        success = sent + delivered + read
        attempts = success + failed
        success_rate = (success / attempts) * 100 if attempts else 100.0

        breakdown_qs = (
            qs.values("institution_id")
            .annotate(
                total=Count("id"),
                sent=Count("id", filter=Q(status=WhatsAppDelivery.STATUS_SENT)),
                delivered=Count("id", filter=Q(status=WhatsAppDelivery.STATUS_DELIVERED)),
                read=Count("id", filter=Q(status=WhatsAppDelivery.STATUS_READ)),
                failed=Count("id", filter=Q(status=WhatsAppDelivery.STATUS_FAILED)),
                suppressed=Count("id", filter=Q(status=WhatsAppDelivery.STATUS_SUPPRESSED)),
            )
            .filter(institution_id__isnull=False)
        )

        for row in breakdown_qs:
            row_success = int(row.get("sent", 0)) + int(row.get("delivered", 0)) + int(row.get("read", 0))
            row_attempts = row_success + int(row.get("failed", 0))
            row_success_rate = (row_success / row_attempts) * 100 if row_attempts else 100.0
            WhatsAppInstitutionMetric.objects.update_or_create(
                institution_id=row["institution_id"],
                window_start=since,
                window_end=now,
                defaults={
                    "total": int(row.get("total", 0)),
                    "sent": int(row.get("sent", 0)),
                    "delivered": int(row.get("delivered", 0)),
                    "read": int(row.get("read", 0)),
                    "failed": int(row.get("failed", 0)),
                    "suppressed": int(row.get("suppressed", 0)),
                    "success_rate": float(row_success_rate),
                },
            )

        breaches = []
        if failed > max_failed:
            breaches.append(f"failed={failed} > max_failed={max_failed}")
        if success_rate < min_success_rate:
            breaches.append(f"success_rate={success_rate:.2f}% < min_success_rate={min_success_rate:.2f}%")

        summary = (
            f"WhatsApp health ({hours}h): total={total} sent={sent} delivered={delivered} "
            f"read={read} failed={failed} suppressed={suppressed} success_rate={success_rate:.2f}%"
        )

        if not breaches:
            self.stdout.write(self.style.SUCCESS(f"OK - {summary}"))
            return

        message = "ALERT - " + summary + " | breaches=" + "; ".join(breaches)
        self.stdout.write(self.style.WARNING(message))

        if notify_admins:
            recipients = list(admin_like_users_qs())
            if recipients:
                window_key = now.strftime("%Y%m%d%H")
                notify_users(
                    recipients=recipients,
                    title="Alerta operativa de WhatsApp",
                    body=message,
                    url="/notifications",
                    type="WHATSAPP_HEALTH_ALERT",
                    dedupe_key=f"whatsapp:health:{window_key}",
                    dedupe_within_seconds=3600,
                )

        if fail_on_breach:
            raise CommandError(message)
