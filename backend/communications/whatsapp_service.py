from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Optional
from urllib import error, request

from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from core.models import Institution

from .models import WhatsAppDelivery, WhatsAppSuppression, WhatsAppTemplateMap
from .runtime_settings import get_effective_whatsapp_settings


@dataclass
class WhatsAppSendResult:
    sent: bool
    delivery: WhatsAppDelivery


def _normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[^0-9+]", "", str(phone or "").strip())
    if cleaned.startswith("00"):
        cleaned = f"+{cleaned[2:]}"
    if cleaned and not cleaned.startswith("+"):
        cleaned = f"+{cleaned}"
    return cleaned


def _resolve_existing_delivery(recipient_phone: str, idempotency_key: str) -> Optional[WhatsAppDelivery]:
    if not idempotency_key:
        return None
    return WhatsAppDelivery.objects.filter(
        recipient_phone=recipient_phone,
        idempotency_key=idempotency_key,
    ).first()


def _resolve_graph_base_url() -> str:
    effective = get_effective_whatsapp_settings()
    return (
        str(effective.graph_base_url or "").strip().rstrip("/")
        or "https://graph.facebook.com"
    )


def _resolve_whatsapp_credentials() -> tuple[str, str, str]:
    effective = get_effective_whatsapp_settings()
    phone_number_id = str(effective.phone_number_id or "").strip()
    access_token = str(effective.access_token or "").strip()
    api_version = str(effective.api_version or "v21.0").strip()
    return phone_number_id, access_token, api_version


def _perform_whatsapp_send(payload: dict) -> tuple[str, dict, str, str]:
    effective = get_effective_whatsapp_settings()
    phone_number_id, access_token, api_version = _resolve_whatsapp_credentials()
    if not phone_number_id or not access_token:
        return "", {}, "MISSING_CONFIG", "Missing WhatsApp credentials (phone_number_id/access_token)."

    endpoint = f"{_resolve_graph_base_url()}/{api_version}/{phone_number_id}/messages"
    encoded_payload = json.dumps(payload).encode("utf-8")
    req = request.Request(
        endpoint,
        data=encoded_payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=int(effective.http_timeout_seconds or 12)) as response:
            raw_body = response.read().decode("utf-8")
            provider_data = json.loads(raw_body) if raw_body else {}
            provider_messages = provider_data.get("messages") if isinstance(provider_data, dict) else []
            provider_message_id = ""
            if isinstance(provider_messages, list) and provider_messages:
                first = provider_messages[0]
                if isinstance(first, dict):
                    provider_message_id = str(first.get("id") or "")
            return provider_message_id, provider_data if isinstance(provider_data, dict) else {"raw": raw_body}, "", ""
    except error.HTTPError as exc:
        response_body = ""
        try:
            response_body = exc.read().decode("utf-8")
        except Exception:
            response_body = str(exc)
        return "", {}, str(exc.code), response_body[:4000]
    except Exception as exc:  # pragma: no cover - defensive guard
        return "", {}, "UNEXPECTED_ERROR", str(exc)


def _resolve_institution_id(institution_id: Optional[int]) -> Optional[int]:
    if institution_id:
        return int(institution_id)
    institution = Institution.objects.order_by("id").first()
    if institution is None:
        return None
    return int(institution.id)


def _build_template_components(
    *,
    body_parameters: Optional[list[str]],
    body_named_parameters: Optional[dict[str, str]],
    components: Optional[list[dict]],
) -> list[dict]:
    if components:
        return components

    if body_named_parameters:
        return [
            {
                "type": "body",
                "parameters": [
                    {
                        "type": "text",
                        "parameter_name": str(name),
                        "text": str(value),
                    }
                    for name, value in body_named_parameters.items()
                ],
            }
        ]

    if body_parameters:
        return [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(param)} for param in body_parameters],
            }
        ]

    return []


def send_whatsapp(
    *,
    recipient_phone: str,
    message_text: str,
    category: str = "transactional",
    idempotency_key: str = "",
    institution_id: Optional[int] = None,
) -> WhatsAppSendResult:
    effective = get_effective_whatsapp_settings()
    if not bool(effective.enabled):
        raise RuntimeError("WhatsApp channel is disabled")

    normalized_phone = _normalize_phone(recipient_phone)
    existing = _resolve_existing_delivery(normalized_phone, idempotency_key)
    if existing is not None:
        return WhatsAppSendResult(sent=False, delivery=existing)

    suppression = WhatsAppSuppression.objects.filter(phone_number=normalized_phone).first()
    if suppression is not None:
        delivery = WhatsAppDelivery.objects.create(
            institution_id=_resolve_institution_id(institution_id),
            recipient_phone=normalized_phone,
            message_text=message_text,
            category=category,
            idempotency_key=idempotency_key,
            status=WhatsAppDelivery.STATUS_SUPPRESSED,
            error_message=f"Suppressed recipient ({suppression.reason})",
            metadata={"reason": suppression.reason},
        )
        return WhatsAppSendResult(sent=False, delivery=delivery)

    try:
        delivery = WhatsAppDelivery.objects.create(
            institution_id=_resolve_institution_id(institution_id),
            recipient_phone=normalized_phone,
            message_text=message_text,
            category=category,
            idempotency_key=idempotency_key,
            status=WhatsAppDelivery.STATUS_PENDING,
        )
    except IntegrityError:
        existing = _resolve_existing_delivery(normalized_phone, idempotency_key)
        if existing is not None:
            return WhatsAppSendResult(sent=False, delivery=existing)
        raise

    payload = {
        "messaging_product": "whatsapp",
        "to": normalized_phone,
        "type": "text",
        "text": {
            "body": str(message_text or "").strip()[:4096],
            "preview_url": False,
        },
    }
    provider_message_id, provider_metadata, error_code, error_message = _perform_whatsapp_send(payload)
    if error_code:
        delivery.status = WhatsAppDelivery.STATUS_FAILED
        delivery.error_code = error_code
        delivery.error_message = error_message
        delivery.save(update_fields=["status", "error_code", "error_message", "updated_at"])
        return WhatsAppSendResult(sent=False, delivery=delivery)

    delivery.status = WhatsAppDelivery.STATUS_SENT
    delivery.provider_message_id = provider_message_id
    delivery.sent_at = timezone.now()
    delivery.error_code = ""
    delivery.error_message = ""
    delivery.metadata = provider_metadata
    delivery.save(
        update_fields=[
            "status",
            "provider_message_id",
            "sent_at",
            "error_code",
            "error_message",
            "metadata",
            "updated_at",
        ]
    )
    return WhatsAppSendResult(sent=True, delivery=delivery)


def send_whatsapp_template(
    *,
    recipient_phone: str,
    template_name: str,
    language_code: str = "es_CO",
    body_parameters: Optional[list[str]] = None,
    body_named_parameters: Optional[dict[str, str]] = None,
    components: Optional[list[dict]] = None,
    category: str = "utility",
    idempotency_key: str = "",
    metadata: Optional[dict] = None,
    institution_id: Optional[int] = None,
) -> WhatsAppSendResult:
    effective = get_effective_whatsapp_settings()
    if not bool(effective.enabled):
        raise RuntimeError("WhatsApp channel is disabled")

    normalized_phone = _normalize_phone(recipient_phone)
    existing = _resolve_existing_delivery(normalized_phone, idempotency_key)
    if existing is not None:
        return WhatsAppSendResult(sent=False, delivery=existing)

    suppression = WhatsAppSuppression.objects.filter(phone_number=normalized_phone).first()
    if suppression is not None:
        delivery = WhatsAppDelivery.objects.create(
            institution_id=_resolve_institution_id(institution_id),
            recipient_phone=normalized_phone,
            message_text=f"template:{template_name}",
            category=category,
            idempotency_key=idempotency_key,
            status=WhatsAppDelivery.STATUS_SUPPRESSED,
            error_message=f"Suppressed recipient ({suppression.reason})",
            metadata={"reason": suppression.reason, "template_name": template_name},
        )
        return WhatsAppSendResult(sent=False, delivery=delivery)

    try:
        delivery = WhatsAppDelivery.objects.create(
            institution_id=_resolve_institution_id(institution_id),
            recipient_phone=normalized_phone,
            message_text=f"template:{template_name}",
            category=category,
            idempotency_key=idempotency_key,
            status=WhatsAppDelivery.STATUS_PENDING,
            metadata=metadata or {},
        )
    except IntegrityError:
        existing = _resolve_existing_delivery(normalized_phone, idempotency_key)
        if existing is not None:
            return WhatsAppSendResult(sent=False, delivery=existing)
        raise

    template_payload = {
        "name": str(template_name or "").strip(),
        "language": {"code": str(language_code or "es_CO").strip() or "es_CO"},
    }
    final_components = _build_template_components(
        body_parameters=body_parameters,
        body_named_parameters=body_named_parameters,
        components=components,
    )
    if final_components:
        template_payload["components"] = final_components

    payload = {
        "messaging_product": "whatsapp",
        "to": normalized_phone,
        "type": "template",
        "template": template_payload,
    }

    provider_message_id, provider_metadata, error_code, error_message = _perform_whatsapp_send(payload)
    if error_code:
        delivery.status = WhatsAppDelivery.STATUS_FAILED
        delivery.error_code = error_code
        delivery.error_message = error_message
        delivery.save(update_fields=["status", "error_code", "error_message", "updated_at"])
        return WhatsAppSendResult(sent=False, delivery=delivery)

    merged_metadata = dict(delivery.metadata or {})
    merged_metadata.update(provider_metadata)
    merged_metadata.update({"template_name": template_name, "language_code": language_code})

    delivery.status = WhatsAppDelivery.STATUS_SENT
    delivery.provider_message_id = provider_message_id
    delivery.sent_at = timezone.now()
    delivery.error_code = ""
    delivery.error_message = ""
    delivery.metadata = merged_metadata
    delivery.save(
        update_fields=[
            "status",
            "provider_message_id",
            "sent_at",
            "error_code",
            "error_message",
            "metadata",
            "updated_at",
        ]
    )
    return WhatsAppSendResult(sent=True, delivery=delivery)


def send_whatsapp_notification(
    *,
    recipient_phone: str,
    notification_type: str,
    recipient_name: str,
    title: str,
    body: str,
    action_url: str,
    idempotency_key: str,
    fallback_text: str,
    institution_id: Optional[int] = None,
) -> WhatsAppSendResult:
    effective = get_effective_whatsapp_settings()
    send_mode = str(effective.send_mode or "template").strip().lower()
    normalized_type = str(notification_type or "").strip().upper()
    template_map = WhatsAppTemplateMap.objects.filter(notification_type=normalized_type, is_active=True).first()

    if send_mode == "template":
        fallback_template_name = str(effective.template_fallback_name or "").strip()
        template_name = template_map.template_name if template_map else fallback_template_name
        language_code = template_map.language_code if template_map else "es_CO"
        category = template_map.category if template_map else "utility"
        if template_name:
            named_parameters: dict[str, str] = {}
            if template_map and isinstance(template_map.body_parameter_names, list) and template_map.body_parameter_names:
                values = [recipient_name, title, body, action_url]
                for index, parameter_name in enumerate(template_map.body_parameter_names):
                    if not isinstance(parameter_name, str):
                        continue
                    if index >= len(values):
                        break
                    named_parameters[parameter_name] = values[index]

            mapped_components = template_map.default_components if (template_map and isinstance(template_map.default_components, list)) else None

            return send_whatsapp_template(
                recipient_phone=recipient_phone,
                template_name=template_name,
                language_code=language_code,
                body_parameters=[recipient_name, title, body, action_url],
                body_named_parameters=named_parameters or None,
                components=mapped_components,
                category=category,
                idempotency_key=idempotency_key,
                metadata={"notification_type": normalized_type},
                institution_id=institution_id,
            )

    return send_whatsapp(
        recipient_phone=recipient_phone,
        message_text=fallback_text,
        category="in-app-notification",
        idempotency_key=idempotency_key,
        institution_id=institution_id,
    )
