from __future__ import annotations

from datetime import timedelta
import logging

from django.conf import settings
from django.utils import timezone

from communications.email_service import send_email
from communications.models import WhatsAppContact
from communications.institution_resolver import resolve_institution_for_user
from communications.template_service import send_templated_email
from communications.whatsapp_service import send_whatsapp_notification

from .models import NotificationDispatch


logger = logging.getLogger(__name__)


def _notification_absolute_url(url: str) -> str:
    safe_url = str(url or "").strip()
    if not safe_url:
        return ""
    if safe_url.startswith("http://") or safe_url.startswith("https://"):
        return safe_url
    if safe_url.startswith("/"):
        base = (
            str(getattr(settings, "KAMPUS_FRONTEND_BASE_URL", "") or "").strip().rstrip("/")
            or str(getattr(settings, "PUBLIC_SITE_URL", "") or "").strip().rstrip("/")
        )
        if base:
            return f"{base}{safe_url}"
    return safe_url


def _notification_template_slug(notification_type: str) -> str:
    normalized = str(notification_type or "").strip().upper()
    if normalized == "NOVELTY_SLA_TEACHER":
        return "novelty-sla-teacher"
    if normalized == "NOVELTY_SLA_ADMIN":
        return "novelty-sla-admin"
    if normalized == "NOVELTY_SLA_COORDINATOR":
        return "novelty-sla-coordinator"
    return "in-app-notification-generic"


def _next_retry(attempts: int, *, max_retries: int = 5) -> timezone.datetime | None:
    if attempts >= max_retries:
        return None
    seconds = min(3600, 60 * (2 ** max(0, attempts - 1)))
    return timezone.now() + timedelta(seconds=seconds)


def _process_email_dispatch(dispatch: NotificationDispatch) -> dict:
    notification = dispatch.notification
    recipient = notification.recipient

    if not getattr(settings, "NOTIFICATIONS_EMAIL_ENABLED", True):
        return {"result": "skipped_disabled", "channel_status": "SKIPPED"}

    recipient_email = (getattr(recipient, "email", "") or "").strip()
    if not recipient_email:
        return {"result": "skipped_no_recipient_email", "channel_status": "SKIPPED"}

    action_url = _notification_absolute_url(notification.url) or _notification_absolute_url("/notifications")

    template_slug = _notification_template_slug(notification.type)
    context = {
        "recipient_name": recipient.get_full_name() or recipient.username,
        "title": notification.title,
        "body": notification.body or "Tienes una nueva notificacion en Kampus.",
        "action_url": action_url,
    }

    try:
        result = send_templated_email(
            slug=template_slug,
            recipient_email=recipient_email,
            context=context,
            category="in-app-notification",
            idempotency_key=dispatch.idempotency_key,
        )
    except Exception:
        logger.exception("Templated email dispatch failed. Falling back to plain email", extra={"dispatch_id": dispatch.id})
        result = send_email(
            recipient_email=recipient_email,
            subject=f"[Kampus] {notification.title}",
            body_text=notification.body or notification.title,
            category="in-app-notification",
            idempotency_key=dispatch.idempotency_key,
        )

    return {
        "result": "processed",
        "channel_status": result.delivery.status,
        "delivery_id": result.delivery.id,
    }


def _process_whatsapp_dispatch(dispatch: NotificationDispatch) -> dict:
    notification = dispatch.notification
    recipient = notification.recipient

    if not getattr(settings, "KAMPUS_WHATSAPP_ENABLED", False):
        return {"result": "skipped_disabled", "channel_status": "SKIPPED"}

    contact = WhatsAppContact.objects.filter(user=recipient, is_active=True).first()
    if contact is None:
        return {"result": "skipped_no_active_contact", "channel_status": "SKIPPED"}

    institution = resolve_institution_for_user(recipient)
    absolute_url = _notification_absolute_url(notification.url)
    body_parts = [
        f"Hola {recipient.get_full_name() or recipient.username},",
        notification.title,
    ]
    if notification.body:
        body_parts.append(notification.body)
    if absolute_url:
        body_parts.append(f"Detalle: {absolute_url}")

    result = send_whatsapp_notification(
        recipient_phone=contact.phone_number,
        notification_type=notification.type,
        recipient_name=recipient.get_full_name() or recipient.username,
        title=notification.title,
        body=notification.body or "Tienes una nueva notificacion en Kampus.",
        action_url=absolute_url,
        idempotency_key=dispatch.idempotency_key,
        fallback_text="\n\n".join(body_parts),
        institution_id=(institution.id if institution else None),
    )

    return {
        "result": "processed",
        "channel_status": result.delivery.status,
        "delivery_id": result.delivery.id,
        "provider_message_id": result.delivery.provider_message_id,
    }


def process_dispatch(dispatch: NotificationDispatch, *, max_retries: int = 5) -> NotificationDispatch:
    attempt = int(dispatch.attempts or 0) + 1
    dispatch.attempts = attempt
    dispatch.status = NotificationDispatch.STATUS_IN_PROGRESS
    dispatch.error_message = ""
    dispatch.save(update_fields=["attempts", "status", "error_message", "updated_at"])

    try:
        if dispatch.channel == NotificationDispatch.CHANNEL_EMAIL:
            result_payload = _process_email_dispatch(dispatch)
        elif dispatch.channel == NotificationDispatch.CHANNEL_WHATSAPP:
            result_payload = _process_whatsapp_dispatch(dispatch)
        else:
            raise ValueError(f"Unsupported channel {dispatch.channel}")

        merged_payload = dict(dispatch.payload or {})
        merged_payload.update(result_payload)
        dispatch.payload = merged_payload
        dispatch.status = NotificationDispatch.STATUS_SUCCEEDED
        dispatch.next_retry_at = None
        dispatch.error_message = ""
        dispatch.processed_at = timezone.now()
        dispatch.save(
            update_fields=[
                "payload",
                "status",
                "next_retry_at",
                "error_message",
                "processed_at",
                "updated_at",
            ]
        )
        return dispatch
    except Exception as exc:
        next_retry_at = _next_retry(attempt, max_retries=max_retries)
        dispatch.status = (
            NotificationDispatch.STATUS_FAILED
            if next_retry_at is not None
            else NotificationDispatch.STATUS_DEAD_LETTER
        )
        dispatch.error_message = str(exc)[:4000]
        dispatch.next_retry_at = next_retry_at
        dispatch.save(update_fields=["status", "error_message", "next_retry_at", "updated_at"])
        return dispatch
