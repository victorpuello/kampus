from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from notifications.dispatch import process_dispatch
from notifications.models import NotificationDispatch


class Command(BaseCommand):
    help = "Procesa outbox de notificaciones (NotificationDispatch)."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=100)
        parser.add_argument("--max-retries", type=int, default=5)

    def handle(self, *args, **options):
        batch_size = max(1, int(options["batch_size"]))
        max_retries = max(1, int(options["max_retries"]))
        now = timezone.now()

        candidates = list(
            NotificationDispatch.objects.filter(
                Q(status=NotificationDispatch.STATUS_PENDING)
                | Q(status=NotificationDispatch.STATUS_FAILED, next_retry_at__lte=now)
            )
            .select_related("notification", "notification__recipient")
            .order_by("created_at")[:batch_size]
        )

        claimed_ids: list[int] = []
        for dispatch in candidates:
            updated = NotificationDispatch.objects.filter(
                id=dispatch.id,
                status__in=[NotificationDispatch.STATUS_PENDING, NotificationDispatch.STATUS_FAILED],
            ).update(status=NotificationDispatch.STATUS_IN_PROGRESS)
            if updated:
                claimed_ids.append(dispatch.id)

        processed = 0
        succeeded = 0
        failed = 0
        dead_letter = 0

        for dispatch in NotificationDispatch.objects.filter(id__in=claimed_ids).select_related("notification", "notification__recipient"):
            result = process_dispatch(dispatch, max_retries=max_retries)
            processed += 1
            if result.status == NotificationDispatch.STATUS_SUCCEEDED:
                succeeded += 1
            elif result.status == NotificationDispatch.STATUS_FAILED:
                failed += 1
            elif result.status == NotificationDispatch.STATUS_DEAD_LETTER:
                dead_letter += 1

        self.stdout.write(
            "notification dispatch outbox "
            f"processed={processed} succeeded={succeeded} failed={failed} dead_letter={dead_letter}"
        )
