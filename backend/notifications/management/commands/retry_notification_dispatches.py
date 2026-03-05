from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from notifications.models import NotificationDispatch


class Command(BaseCommand):
    help = "Reagenda dispatches fallidos/DLQ para reintento manual desde operaciones."

    def add_arguments(self, parser):
        parser.add_argument("--channel", type=str, default="", help="EMAIL o WHATSAPP")
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        channel = str(options.get("channel") or "").strip().upper()
        limit = max(1, int(options.get("limit") or 100))

        qs = NotificationDispatch.objects.filter(
            Q(status=NotificationDispatch.STATUS_FAILED) | Q(status=NotificationDispatch.STATUS_DEAD_LETTER)
        )
        if channel in {NotificationDispatch.CHANNEL_EMAIL, NotificationDispatch.CHANNEL_WHATSAPP}:
            qs = qs.filter(channel=channel)

        ids = list(qs.order_by("created_at").values_list("id", flat=True)[:limit])
        if not ids:
            self.stdout.write("notification dispatch retry queued=0")
            return

        queued = NotificationDispatch.objects.filter(id__in=ids).update(
            status=NotificationDispatch.STATUS_PENDING,
            next_retry_at=timezone.now(),
            error_message="",
        )
        self.stdout.write(f"notification dispatch retry queued={queued}")
