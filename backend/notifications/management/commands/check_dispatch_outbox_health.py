from __future__ import annotations

import os
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from notifications.models import NotificationDispatch
from notifications.services import admin_like_users_qs, notify_users


def _env_int(name: str, default: int) -> int:
    raw = ("" if name is None else str(os.getenv(name, "")).strip())
    if not raw:
        return int(default)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return int(default)


def _env_bool(name: str, default: bool) -> bool:
    raw = ("" if name is None else str(os.getenv(name, "")).strip().lower())
    if not raw:
        return bool(default)
    return raw in {"1", "true", "yes", "on"}


class Command(BaseCommand):
    help = "Evalua salud operativa del outbox NotificationDispatch y alerta ante acumulacion."

    def add_arguments(self, parser):
        parser.add_argument(
            "--max-pending",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_PENDING", 500),
            help="Maximo de dispatches PENDING permitidos.",
        )
        parser.add_argument(
            "--max-failed",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_FAILED", 100),
            help="Maximo de dispatches FAILED permitidos.",
        )
        parser.add_argument(
            "--max-oldest-pending-age-seconds",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_OLDEST_PENDING_AGE_SECONDS", 900),
            help="Edad maxima permitida del PENDING mas antiguo.",
        )
        parser.add_argument(
            "--max-dead-letter",
            type=int,
            default=_env_int("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_DEAD_LETTER", 20),
            help="Maximo de dispatches en DEAD_LETTER permitidos.",
        )
        parser.add_argument(
            "--notify-admins",
            action="store_true",
            default=_env_bool("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_NOTIFY_ADMINS", False),
            help="Crea notificacion in-app para admins cuando hay breach.",
        )
        parser.add_argument(
            "--fail-on-breach",
            action="store_true",
            default=False,
            help="Falla el comando cuando hay breach.",
        )
        parser.add_argument(
            "--no-fail-on-breach",
            action="store_true",
            default=False,
            help="Nunca falla el comando aunque haya breach.",
        )

    def handle(self, *args, **options):
        max_pending = max(0, int(options["max_pending"]))
        max_failed = max(0, int(options["max_failed"]))
        max_oldest_pending_age_seconds = max(0, int(options["max_oldest_pending_age_seconds"]))
        max_dead_letter = max(0, int(options["max_dead_letter"]))
        notify_admins = bool(options["notify_admins"])

        default_fail = _env_bool("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_FAIL_ON_BREACH", True)
        if bool(options["no_fail_on_breach"]):
            fail_on_breach = False
        elif bool(options["fail_on_breach"]):
            fail_on_breach = True
        else:
            fail_on_breach = default_fail

        now = timezone.now()
        pending_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_PENDING)
        failed_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_FAILED)
        in_progress_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_IN_PROGRESS)
        dead_letter_qs = NotificationDispatch.objects.filter(status=NotificationDispatch.STATUS_DEAD_LETTER)

        pending = pending_qs.count()
        failed = failed_qs.count()
        in_progress = in_progress_qs.count()
        dead_letter = dead_letter_qs.count()
        retry_ready_failed = failed_qs.filter(next_retry_at__lte=now).count()

        oldest_pending = pending_qs.order_by("created_at").values_list("created_at", flat=True).first()
        oldest_pending_age_seconds = (
            max(0, int((now - oldest_pending).total_seconds())) if oldest_pending else 0
        )

        breaches = []
        if pending > max_pending:
            breaches.append(f"pending={pending} > max_pending={max_pending}")
        if failed > max_failed:
            breaches.append(f"failed={failed} > max_failed={max_failed}")
        if oldest_pending_age_seconds > max_oldest_pending_age_seconds:
            breaches.append(
                "oldest_pending_age_seconds="
                f"{oldest_pending_age_seconds} > max_oldest_pending_age_seconds={max_oldest_pending_age_seconds}"
            )
        if dead_letter > max_dead_letter:
            breaches.append(f"dead_letter={dead_letter} > max_dead_letter={max_dead_letter}")

        summary = (
            "Dispatch outbox health: "
            f"pending={pending} in_progress={in_progress} failed={failed} dead_letter={dead_letter} "
            f"retry_ready_failed={retry_ready_failed} oldest_pending_age_seconds={oldest_pending_age_seconds}"
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
                    title="Alerta operativa outbox de notificaciones",
                    body=message,
                    url="/notifications",
                    type="NOTIFICATION_DISPATCH_OUTBOX_ALERT",
                    dedupe_key=f"notifications:dispatch:health:{window_key}",
                    dedupe_within_seconds=3600,
                )

        if fail_on_breach:
            raise CommandError(message)
