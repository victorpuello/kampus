from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError
from django.utils import timezone

from .models import EmailDelivery, EmailSuppression
from .preferences import (
    build_unsubscribe_url,
    get_or_create_preference,
    is_marketing_category,
)
from .runtime_settings import apply_effective_mail_settings


@dataclass
class EmailSendResult:
    sent: bool
    delivery: EmailDelivery


def _resolve_existing_delivery(recipient_email: str, idempotency_key: str) -> Optional[EmailDelivery]:
    if not idempotency_key:
        return None
    return EmailDelivery.objects.filter(
        recipient_email=recipient_email,
        idempotency_key=idempotency_key,
    ).first()


def send_email(
    *,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str = "",
    category: str = "transactional",
    idempotency_key: str = "",
    from_email: Optional[str] = None,
) -> EmailSendResult:
    effective = apply_effective_mail_settings()
    existing = _resolve_existing_delivery(recipient_email, idempotency_key)
    if existing is not None:
        return EmailSendResult(sent=False, delivery=existing)

    normalized_recipient_email = (recipient_email or "").strip().lower()
    is_marketing = is_marketing_category(category)

    if is_marketing:
        preference = get_or_create_preference(email=normalized_recipient_email)
        if not preference.marketing_opt_in:
            delivery = EmailDelivery.objects.create(
                recipient_email=normalized_recipient_email,
                subject=subject,
                body_text=body_text,
                body_html=body_html,
                category=category,
                idempotency_key=idempotency_key,
                status=EmailDelivery.STATUS_SUPPRESSED,
                error_message="Suppressed recipient (marketing_opt_in=false)",
            )
            return EmailSendResult(sent=False, delivery=delivery)

    suppression = EmailSuppression.objects.filter(email=normalized_recipient_email).first()
    is_suppressed = False
    if suppression is not None:
        if suppression.reason == EmailSuppression.REASON_UNSUBSCRIBED:
            is_suppressed = is_marketing
        elif suppression.reason != EmailSuppression.REASON_SOFT_BOUNCE:
            is_suppressed = True
        else:
            is_suppressed = int(suppression.failure_count or 0) >= 3

    if is_suppressed:
        delivery = EmailDelivery.objects.create(
            recipient_email=normalized_recipient_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            category=category,
            idempotency_key=idempotency_key,
            status=EmailDelivery.STATUS_SUPPRESSED,
            error_message=f"Suppressed recipient ({suppression.reason})",
        )
        return EmailSendResult(sent=False, delivery=delivery)

    try:
        delivery = EmailDelivery.objects.create(
            recipient_email=normalized_recipient_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            category=category,
            idempotency_key=idempotency_key,
            status=EmailDelivery.STATUS_PENDING,
        )
    except IntegrityError:
        existing = _resolve_existing_delivery(recipient_email, idempotency_key)
        if existing is not None:
            return EmailSendResult(sent=False, delivery=existing)
        raise

    message = EmailMultiAlternatives(
        subject=subject,
        body=body_text,
        from_email=from_email or effective.default_from_email,
        to=[normalized_recipient_email],
    )

    if is_marketing:
        unsubscribe_url = build_unsubscribe_url(email=normalized_recipient_email)
        if unsubscribe_url:
            message.body = f"{body_text}\n\nPara dejar de recibir estos correos: {unsubscribe_url}"
            message.extra_headers = {
                "List-Unsubscribe": f"<{unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
    if body_html:
        message.attach_alternative(body_html, "text/html")

    message.tags = [category]
    message.metadata = {
        "delivery_id": str(delivery.id),
        "category": category,
        "idempotency_key": idempotency_key,
    }

    try:
        message.send(fail_silently=False)
        provider_message_id = str(getattr(message, "anymail_status", None).message_id or "") if getattr(message, "anymail_status", None) else ""
        delivery.status = EmailDelivery.STATUS_SENT
        delivery.provider_message_id = provider_message_id
        delivery.sent_at = timezone.now()
        delivery.error_message = ""
    except Exception as exc:
        delivery.status = EmailDelivery.STATUS_FAILED
        delivery.error_message = str(exc)

    delivery.save(update_fields=["status", "provider_message_id", "sent_at", "error_message", "updated_at"])
    return EmailSendResult(sent=delivery.status == EmailDelivery.STATUS_SENT, delivery=delivery)
