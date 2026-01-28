from __future__ import annotations

from datetime import timedelta
import os

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.services import admin_like_users_qs, notify_users
from novelties.models import NoveltyCase


class Command(BaseCommand):
    help = "Notifica casos de novedades en revisión que superan el SLA."

    def handle(self, *args, **options):
        days = int(os.getenv("KAMPUS_NOVELTIES_SLA_DAYS", "3"))
        since = timezone.now() - timedelta(days=days)

        overdue = NoveltyCase.objects.filter(
            status=NoveltyCase.Status.IN_REVIEW,
            updated_at__lte=since,
        ).order_by("updated_at")

        count = overdue.count()
        if count == 0:
            self.stdout.write("No hay casos vencidos")
            return

        recipients = admin_like_users_qs()
        notify_users(
            recipients=recipients,
            title=f"SLA vencido: {count} novedades en revisión",
            body=f"Hay {count} casos en IN_REVIEW sin cambios desde hace {days}+ días.",
            url="/novelties",
            type="NOVELTY_SLA",
            dedupe_key=f"novelties:sla:{days}:{timezone.now().date().isoformat()}",
            dedupe_within_seconds=60 * 60,
        )

        self.stdout.write(f"Notificaciones enviadas para {count} casos")
