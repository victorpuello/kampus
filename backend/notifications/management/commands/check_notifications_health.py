from __future__ import annotations

import os
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from communications.models import EmailDelivery
from reports.models import PeriodicJobRuntimeConfig

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
    help = "Evalúa salud operativa de notificaciones y dispara alerta si excede umbrales."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24, help="Ventana de análisis en horas (default: 24).")
        parser.add_argument(
            "--max-failed",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_ALERT_MAX_FAILED", 10),
            help="Máximo de envíos FALLIDOS permitidos en la ventana.",
        )
        parser.add_argument(
            "--max-suppressed",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_ALERT_MAX_SUPPRESSED", 50),
            help="Máximo de envíos SUPPRESSED permitidos en la ventana.",
        )
        parser.add_argument(
            "--min-success-rate",
            type=float,
            default=_env_float("KAMPUS_NOTIFICATIONS_ALERT_MIN_SUCCESS_RATE", 90.0),
            help="Porcentaje mínimo de éxito sobre intentos (SENT/(SENT+FAILED)).",
        )
        parser.add_argument(
            "--notify-admins",
            action="store_true",
            default=_env_bool("KAMPUS_NOTIFICATIONS_ALERT_NOTIFY_ADMINS", False),
            help="Crear notificación in-app a roles administrativos cuando hay breach.",
        )
        parser.add_argument(
            "--fail-on-breach",
            action="store_true",
            default=False,
            help="Falla el comando con código no-cero cuando hay breach.",
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
        max_suppressed = max(0, int(options["max_suppressed"]))
        min_success_rate = float(options["min_success_rate"])
        notify_admins = bool(options["notify_admins"])

        runtime_cfg = PeriodicJobRuntimeConfig.objects.filter(job_key="check-notifications-health").first()
        runtime_params = (runtime_cfg.params_override or {}) if runtime_cfg else {}
        if isinstance(runtime_params.get("max_failed"), int):
            max_failed = max(0, int(runtime_params["max_failed"]))
        if isinstance(runtime_params.get("max_suppressed"), int):
            max_suppressed = max(0, int(runtime_params["max_suppressed"]))

        default_fail = _env_bool("KAMPUS_NOTIFICATIONS_ALERT_FAIL_ON_BREACH", True)
        if bool(options["no_fail_on_breach"]):
            fail_on_breach = False
        elif bool(options["fail_on_breach"]):
            fail_on_breach = True
        else:
            fail_on_breach = default_fail

        now = timezone.now()
        since = now - timedelta(hours=hours)

        email_qs = EmailDelivery.objects.filter(created_at__gte=since)
        total = email_qs.count()
        sent = email_qs.filter(status=EmailDelivery.STATUS_SENT).count()
        failed = email_qs.filter(status=EmailDelivery.STATUS_FAILED).count()
        suppressed = email_qs.filter(status=EmailDelivery.STATUS_SUPPRESSED).count()

        attempts = sent + failed
        success_rate = (sent / attempts) * 100 if attempts else 100.0

        breaches = []
        if failed > max_failed:
            breaches.append(f"failed={failed} > max_failed={max_failed}")
        if suppressed > max_suppressed:
            breaches.append(f"suppressed={suppressed} > max_suppressed={max_suppressed}")
        if success_rate < min_success_rate:
            breaches.append(
                f"success_rate={success_rate:.2f}% < min_success_rate={min_success_rate:.2f}%"
            )

        summary = (
            f"Notifications health ({hours}h): total={total} sent={sent} failed={failed} "
            f"suppressed={suppressed} success_rate={success_rate:.2f}%"
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
                    title="Alerta operativa de notificaciones",
                    body=message,
                    url="/notifications",
                    type="NOTIFICATION_HEALTH_ALERT",
                    dedupe_key=f"notifications:health:{window_key}",
                    dedupe_within_seconds=3600,
                )

        if fail_on_breach:
            raise CommandError(message)
