from __future__ import annotations

from datetime import timedelta
from typing import Iterable, Optional

from django.utils import timezone

from users.models import User

from .models import Notification


ADMIN_LIKE_ROLES = {
    User.ROLE_SUPERADMIN,
    User.ROLE_ADMIN,
    User.ROLE_COORDINATOR,
}


def create_notification(
    *,
    recipient: User,
    title: str,
    body: str = "",
    url: str = "",
    type: str = "",
    dedupe_key: str = "",
    dedupe_within_seconds: Optional[int] = None,
) -> Notification:
    if dedupe_within_seconds is not None and dedupe_key:
        since = timezone.now() - timedelta(seconds=int(dedupe_within_seconds))
        if Notification.objects.filter(
            recipient=recipient,
            dedupe_key=dedupe_key,
            created_at__gte=since,
        ).exists():
            # Return the most recent one (best-effort) so callers can continue.
            existing = (
                Notification.objects.filter(
                    recipient=recipient,
                    dedupe_key=dedupe_key,
                    created_at__gte=since,
                )
                .order_by("-created_at")
                .first()
            )
            if existing is not None:
                return existing

    return Notification.objects.create(
        recipient=recipient,
        type=type,
        title=title,
        body=body,
        url=url,
        dedupe_key=dedupe_key,
    )


def notify_users(
    *,
    recipients: Iterable[User],
    title: str,
    body: str = "",
    url: str = "",
    type: str = "",
    dedupe_key: str = "",
    dedupe_within_seconds: Optional[int] = None,
) -> int:
    recipients_list = list(recipients)
    if not recipients_list:
        return 0

    if dedupe_within_seconds is not None and dedupe_key:
        since = timezone.now() - timedelta(seconds=int(dedupe_within_seconds))
        existing_ids = set(
            Notification.objects.filter(
                recipient__in=recipients_list,
                dedupe_key=dedupe_key,
                created_at__gte=since,
            ).values_list("recipient_id", flat=True)
        )
        recipients_list = [u for u in recipients_list if u.id not in existing_ids]
        if not recipients_list:
            return 0

    notifications = [
        Notification(
            recipient=u,
            type=type,
            title=title,
            body=body,
            url=url,
            dedupe_key=dedupe_key,
        )
        for u in recipients_list
    ]
    if not notifications:
        return 0
    Notification.objects.bulk_create(notifications)
    return len(notifications)


def admin_like_users_qs():
    return User.objects.filter(role__in=sorted(ADMIN_LIKE_ROLES), is_active=True)


def mark_all_read_for_user(user: User) -> int:
    now = timezone.now()
    return Notification.objects.filter(recipient=user, read_at__isnull=True).update(read_at=now)
