from __future__ import annotations

import hashlib
import logging
from datetime import timedelta
from typing import Iterable, Optional

from django.conf import settings
from django.utils import timezone

from communications.email_service import send_email
from communications.template_service import send_templated_email
from users.models import User

from .models import Notification


logger = logging.getLogger(__name__)


ADMIN_LIKE_ROLES = {
    User.ROLE_SUPERADMIN,
    User.ROLE_ADMIN,
    User.ROLE_COORDINATOR,
}


def _notification_absolute_url(url: str) -> str:
    safe_url = str(url or "").strip()
    if not safe_url:
        return ""
    if safe_url.startswith("http://") or safe_url.startswith("https://"):
        return safe_url
    if safe_url.startswith("/"):
        base = str(getattr(settings, "KAMPUS_FRONTEND_BASE_URL", "") or "").strip().rstrip("/")
        if base:
            return f"{base}{safe_url}"
    return safe_url


def _notification_email_idempotency_key(*, recipient: User, dedupe_key: str, notification_id: int) -> str:
    source = dedupe_key or f"notification:{notification_id}"
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:24]
    return f"notif-email:{recipient.id}:{digest}"


def _notification_template_slug(notification_type: str) -> str:
    normalized = str(notification_type or "").strip().upper()
    if normalized == "NOVELTY_SLA_TEACHER":
        return "novelty-sla-teacher"
    if normalized == "NOVELTY_SLA_ADMIN":
        return "novelty-sla-admin"
    if normalized == "NOVELTY_SLA_COORDINATOR":
        return "novelty-sla-coordinator"
    return "in-app-notification-generic"


def _send_notification_email(*, recipient: User, notification: Notification) -> None:
    if not getattr(settings, "NOTIFICATIONS_EMAIL_ENABLED", True):
        return

    recipient_email = (getattr(recipient, "email", "") or "").strip()
    if not recipient_email:
        return

    absolute_url = _notification_absolute_url(notification.url) or _notification_absolute_url("/notifications")
    body_parts = [
        f"Hola {recipient.get_full_name() or recipient.username},",
        "",
        notification.title,
    ]
    if notification.body:
        body_parts.extend(["", notification.body])
    if absolute_url:
        body_parts.extend(["", f"Ver detalle: {absolute_url}"])
    body_parts.extend(["", "Este mensaje fue generado automáticamente por Kampus."])
    body_text = "\n".join(body_parts)

    email_idempotency = _notification_email_idempotency_key(
        recipient=recipient,
        dedupe_key=notification.dedupe_key,
        notification_id=notification.id,
    )

    template_slug = _notification_template_slug(notification.type)
    template_context = {
        "recipient_name": recipient.get_full_name() or recipient.username,
        "title": notification.title,
        "body": notification.body or "Tienes una nueva notificación en Kampus.",
        "action_url": absolute_url,
    }

    try:
        send_templated_email(
            slug=template_slug,
            recipient_email=recipient_email,
            context=template_context,
            category="in-app-notification",
            idempotency_key=email_idempotency,
        )
        return
    except Exception:
        logger.exception(
            "Failed sending templated notification email (template=%s, notification_id=%s)",
            template_slug,
            notification.id,
        )

    send_email(
        recipient_email=recipient_email,
        subject=f"[Kampus] {notification.title}",
        body_text=body_text,
        category="in-app-notification",
        idempotency_key=email_idempotency,
    )


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

    notification = Notification.objects.create(
        recipient=recipient,
        type=type,
        title=title,
        body=body,
        url=url,
        dedupe_key=dedupe_key,
    )
    _send_notification_email(recipient=recipient, notification=notification)
    return notification


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

    created_count = 0
    for recipient in recipients_list:
        create_notification(
            recipient=recipient,
            title=title,
            body=body,
            url=url,
            type=type,
            dedupe_key=dedupe_key,
            dedupe_within_seconds=dedupe_within_seconds,
        )
        created_count += 1
    return created_count


def admin_like_users_qs():
    return User.objects.filter(role__in=sorted(ADMIN_LIKE_ROLES), is_active=True)


def mark_all_read_for_user(user: User) -> int:
    now = timezone.now()
    return Notification.objects.filter(recipient=user, read_at__isnull=True).update(read_at=now)
