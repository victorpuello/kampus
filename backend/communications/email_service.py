from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError
from django.utils import timezone

from .observability import emit_notification_event
from .models import EmailDelivery, EmailSuppression
from .preferences import (
    build_unsubscribe_url,
    get_or_create_preference,
    is_marketing_category,
)
from .runtime_settings import apply_effective_mail_settings


logger = logging.getLogger(__name__)


@dataclass
class EmailSendResult:
    sent: bool
    delivery: EmailDelivery


_LEGAL_DISCLAIMER_TEXT = (
    "ESTE CORREO ES ÚNICAMENTE INFORMATIVO - POR FAVOR NO RESPONDER ESTE MENSAJE\n"
    "NO RESPONDER - Mensaje generado automáticamente.\n"
    "Si tienes alguna consulta con respecto a este correo, puedes contactarte directamente con la Entidad Territorial donde radicaste tu solicitud.\n"
    "Este correo es únicamente informativo y es de uso exclusivo del destinatario(a); puede contener información privilegiada y/o confidencial. "
    "Si no eres el destinatario(a), deberás eliminarlo inmediatamente. El mal uso, divulgación no autorizada, alteración y/o modificación "
    "malintencionada de este mensaje y sus anexos está estrictamente prohibido y puede ser legalmente sancionado."
)


def _append_legal_disclaimer_text(content: str) -> str:
    base = str(content or "").rstrip()
    if _LEGAL_DISCLAIMER_TEXT in base:
        return base
    if not base:
        return _LEGAL_DISCLAIMER_TEXT
    return f"{base}\n\n{_LEGAL_DISCLAIMER_TEXT}"


def _append_legal_disclaimer_html(content: str) -> str:
    base = str(content or "").rstrip()
    marker = "data-kampus-legal-disclaimer"
    if marker in base:
        return base

    disclaimer_block = (
        '<div data-kampus-legal-disclaimer="true" style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;'
        'font-size:11px;line-height:1.55;color:#64748b;">'
        '<p style="margin:0 0 8px 0;"><strong>ESTE CORREO ES ÚNICAMENTE INFORMATIVO - POR FAVOR NO RESPONDER ESTE MENSAJE.</strong><br />'
        'NO RESPONDER - Mensaje generado automáticamente.</p>'
        '<p style="margin:0 0 8px 0;">Si tienes alguna consulta con respecto a este correo, puedes contactarte directamente con la Entidad Territorial '
        'donde radicaste tu solicitud.</p>'
        '<p style="margin:0;">Este correo es únicamente informativo y es de uso exclusivo del destinatario(a); puede contener información privilegiada '
        'y/o confidencial. Si no eres el destinatario(a), deberás eliminarlo inmediatamente. El mal uso, divulgación no autorizada, alteración '
        'y/o modificación malintencionada de este mensaje y sus anexos está estrictamente prohibido y puede ser legalmente sancionado.</p>'
        '</div>'
    )

    if not base:
        return disclaimer_block

    lower_base = base.lower()
    body_close_idx = lower_base.rfind("</body>")
    if body_close_idx != -1:
        return f"{base[:body_close_idx]}{disclaimer_block}{base[body_close_idx:]}"
    return f"{base}{disclaimer_block}"


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
    environment: Optional[str] = None,
) -> EmailSendResult:
    emit_notification_event(
        logger=logger,
        event="channel.email.send.start",
        notification_id="",
        dedupe_key="",
        idempotency_key=idempotency_key,
        channel="email",
        institution_id="",
        recipient_email=recipient_email,
        category=category,
    )

    effective = apply_effective_mail_settings(environment=environment)
    existing = _resolve_existing_delivery(recipient_email, idempotency_key)
    if existing is not None:
        emit_notification_event(
            logger=logger,
            event="channel.email.send.skipped.idempotent_hit",
            notification_id="",
            dedupe_key="",
            idempotency_key=idempotency_key,
            channel="email",
            institution_id="",
            delivery_id=existing.id,
            status=existing.status,
        )
        return EmailSendResult(sent=False, delivery=existing)

    normalized_recipient_email = (recipient_email or "").strip().lower()
    normalized_body_text = _append_legal_disclaimer_text(body_text)
    normalized_body_html = _append_legal_disclaimer_html(body_html) if body_html else ""
    is_marketing = is_marketing_category(category)

    if is_marketing:
        preference = get_or_create_preference(email=normalized_recipient_email)
        if not preference.marketing_opt_in:
            delivery = EmailDelivery.objects.create(
                recipient_email=normalized_recipient_email,
                subject=subject,
                body_text=normalized_body_text,
                body_html=normalized_body_html,
                category=category,
                idempotency_key=idempotency_key,
                status=EmailDelivery.STATUS_SUPPRESSED,
                error_message="Suppressed recipient (marketing_opt_in=false)",
            )
            emit_notification_event(
                logger=logger,
                event="channel.email.send.suppressed.marketing_opt_out",
                notification_id="",
                dedupe_key="",
                idempotency_key=idempotency_key,
                channel="email",
                institution_id="",
                delivery_id=delivery.id,
                status=delivery.status,
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
            body_text=normalized_body_text,
            body_html=normalized_body_html,
            category=category,
            idempotency_key=idempotency_key,
            status=EmailDelivery.STATUS_SUPPRESSED,
            error_message=f"Suppressed recipient ({suppression.reason})",
        )
        emit_notification_event(
            logger=logger,
            event="channel.email.send.suppressed.recipient",
            notification_id="",
            dedupe_key="",
            idempotency_key=idempotency_key,
            channel="email",
            institution_id="",
            delivery_id=delivery.id,
            status=delivery.status,
            suppression_reason=suppression.reason,
        )
        return EmailSendResult(sent=False, delivery=delivery)

    try:
        delivery = EmailDelivery.objects.create(
            recipient_email=normalized_recipient_email,
            subject=subject,
            body_text=normalized_body_text,
            body_html=normalized_body_html,
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
        body=normalized_body_text,
        from_email=from_email or effective.default_from_email,
        to=[normalized_recipient_email],
    )

    if is_marketing:
        unsubscribe_url = build_unsubscribe_url(email=normalized_recipient_email)
        if unsubscribe_url:
            message.body = f"{normalized_body_text}\n\nPara dejar de recibir estos correos: {unsubscribe_url}"
            message.extra_headers = {
                "List-Unsubscribe": f"<{unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
    if normalized_body_html:
        message.attach_alternative(normalized_body_html, "text/html")

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
    emit_notification_event(
        logger=logger,
        event="channel.email.send.result",
        notification_id="",
        dedupe_key="",
        idempotency_key=idempotency_key,
        channel="email",
        institution_id="",
        delivery_id=delivery.id,
        status=delivery.status,
        provider_message_id=delivery.provider_message_id,
    )
    return EmailSendResult(sent=delivery.status == EmailDelivery.STATUS_SENT, delivery=delivery)
