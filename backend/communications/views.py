from __future__ import annotations

import hashlib
import hmac

from django.conf import settings
from django.core import signing
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EmailDelivery, EmailEvent, EmailSuppression
from .preferences import (
	get_or_create_preference,
	set_marketing_preference,
	validate_unsubscribe_token,
)


def _normalize_message_id(value: str) -> str:
	raw = str(value or "").strip()
	if raw.startswith("<") and raw.endswith(">") and len(raw) >= 2:
		return raw[1:-1]
	return raw


def _extract_event_data(payload: dict) -> dict:
	if isinstance(payload.get("event-data"), dict):
		return payload["event-data"]
	return payload


def _extract_message_id(event_data: dict) -> str:
	message = event_data.get("message") if isinstance(event_data.get("message"), dict) else {}
	headers = message.get("headers") if isinstance(message.get("headers"), dict) else {}
	return _normalize_message_id(
		message.get("id")
		or headers.get("message-id")
		or event_data.get("message-id")
		or ""
	)


def _is_valid_mailgun_signature(payload: dict) -> bool:
	signing_key = str(getattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "") or "").strip()
	if not signing_key:
		return not bool(getattr(settings, "MAILGUN_WEBHOOK_STRICT", False))

	signature_data = payload.get("signature") if isinstance(payload.get("signature"), dict) else {}
	timestamp = str(signature_data.get("timestamp") or "")
	token = str(signature_data.get("token") or "")
	signature = str(signature_data.get("signature") or "")
	if not timestamp or not token or not signature:
		return False

	digest = hmac.new(
		signing_key.encode("utf-8"),
		msg=f"{timestamp}{token}".encode("utf-8"),
		digestmod=hashlib.sha256,
	).hexdigest()
	return hmac.compare_digest(digest, signature)


def _upsert_suppression(*, email: str, reason: str, source_event_id: str, provider: str = "mailgun") -> None:
	normalized_email = str(email or "").strip().lower()
	if not normalized_email:
		return

	suppression, created = EmailSuppression.objects.get_or_create(
		email=normalized_email,
		defaults={
			"reason": reason,
			"provider": provider,
			"source_event_id": source_event_id,
			"failure_count": 1,
		},
	)
	if not created:
		suppression.reason = reason
		suppression.source_event_id = source_event_id or suppression.source_event_id
		suppression.failure_count = max(1, suppression.failure_count)
		suppression.save(update_fields=["reason", "source_event_id", "failure_count", "updated_at"])


def _handle_event_suppression(*, event_type: str, recipient_email: str, event_data: dict, provider_event_id: str) -> None:
	normalized_email = str(recipient_email or "").strip().lower()
	if not normalized_email:
		return

	if event_type == "complained":
		_upsert_suppression(
			email=normalized_email,
			reason=EmailSuppression.REASON_COMPLAINT,
			source_event_id=provider_event_id,
		)
		return

	if event_type == "unsubscribed":
		_upsert_suppression(
			email=normalized_email,
			reason=EmailSuppression.REASON_UNSUBSCRIBED,
			source_event_id=provider_event_id,
		)
		return

	if event_type != "failed":
		return

	severity = str(
		event_data.get("severity")
		or ((event_data.get("delivery-status") or {}).get("severity") if isinstance(event_data.get("delivery-status"), dict) else "")
		or ""
	).strip().lower()

	if severity == "temporary":
		suppression, created = EmailSuppression.objects.get_or_create(
			email=normalized_email,
			defaults={
				"reason": EmailSuppression.REASON_SOFT_BOUNCE,
				"provider": "mailgun",
				"source_event_id": provider_event_id,
				"failure_count": 1,
			},
		)
		if not created:
			suppression.failure_count += 1
		suppression.source_event_id = provider_event_id or suppression.source_event_id
		suppression.reason = EmailSuppression.REASON_SOFT_BOUNCE
		suppression.save(update_fields=["failure_count", "reason", "source_event_id", "updated_at"])
		return

	_upsert_suppression(
		email=normalized_email,
		reason=EmailSuppression.REASON_HARD_BOUNCE,
		source_event_id=provider_event_id,
	)


def _update_delivery_status(*, event_type: str, provider_message_id: str) -> None:
	if not provider_message_id:
		return

	delivery = EmailDelivery.objects.filter(provider_message_id=provider_message_id).first()
	if delivery is None:
		return

	if event_type == "delivered":
		if delivery.status != EmailDelivery.STATUS_SENT:
			delivery.status = EmailDelivery.STATUS_SENT
			delivery.save(update_fields=["status", "updated_at"])
		return

	if event_type in {"failed", "complained", "unsubscribed"}:
		delivery.status = EmailDelivery.STATUS_FAILED
		if event_type == "failed":
			delivery.error_message = "Mailgun event: failed"
		elif event_type == "complained":
			delivery.error_message = "Mailgun event: complained"
		else:
			delivery.error_message = "Mailgun event: unsubscribed"
		delivery.save(update_fields=["status", "error_message", "updated_at"])


@method_decorator(csrf_exempt, name="dispatch")
class MailgunWebhookView(APIView):
	permission_classes = [AllowAny]
	authentication_classes = []

	def post(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}
		if not _is_valid_mailgun_signature(payload):
			return Response({"detail": "Invalid Mailgun signature."}, status=status.HTTP_400_BAD_REQUEST)

		event_data = _extract_event_data(payload)
		event_type = str(event_data.get("event") or "").strip().lower()
		recipient_email = str(event_data.get("recipient") or "").strip().lower()
		provider_event_id = str(event_data.get("id") or event_data.get("event-id") or "").strip()
		provider_message_id = _extract_message_id(event_data)

		if provider_event_id:
			if EmailEvent.objects.filter(provider="mailgun", provider_event_id=provider_event_id).exists():
				return Response({"detail": "Event already processed."}, status=status.HTTP_200_OK)

		EmailEvent.objects.create(
			provider="mailgun",
			provider_event_id=provider_event_id,
			event_type=event_type or "unknown",
			recipient_email=recipient_email,
			provider_message_id=provider_message_id,
			payload=payload,
		)

		_update_delivery_status(event_type=event_type, provider_message_id=provider_message_id)
		_handle_event_suppression(
			event_type=event_type,
			recipient_email=recipient_email,
			event_data=event_data,
			provider_event_id=provider_event_id,
		)

		return Response({"detail": "Processed"}, status=status.HTTP_200_OK)


class CommunicationPreferenceMeView(APIView):
	permission_classes = [IsAuthenticated]

	def get(self, request, *args, **kwargs):
		user = request.user
		email = str(getattr(user, "email", "") or "").strip().lower()
		if not email:
			return Response({"detail": "El usuario no tiene correo configurado."}, status=status.HTTP_400_BAD_REQUEST)

		preference = get_or_create_preference(email=email, user=user)
		return Response(
			{
				"email": preference.email,
				"marketing_opt_in": preference.marketing_opt_in,
				"updated_at": preference.updated_at,
			}
		)

	def put(self, request, *args, **kwargs):
		user = request.user
		email = str(getattr(user, "email", "") or "").strip().lower()
		if not email:
			return Response({"detail": "El usuario no tiene correo configurado."}, status=status.HTTP_400_BAD_REQUEST)

		if "marketing_opt_in" not in request.data:
			return Response({"detail": "marketing_opt_in es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		marketing_opt_in = bool(request.data.get("marketing_opt_in"))
		preference = get_or_create_preference(email=email, user=user)
		set_marketing_preference(
			preference=preference,
			opt_in=marketing_opt_in,
			source="USER",
			notes=f"Updated by user_id={user.id}",
		)

		if not marketing_opt_in:
			EmailSuppression.objects.update_or_create(
				email=email,
				defaults={
					"reason": EmailSuppression.REASON_UNSUBSCRIBED,
					"provider": "kampus",
					"source_event_id": f"preference-user-{user.id}",
					"failure_count": 1,
				},
			)
		else:
			EmailSuppression.objects.filter(email=email, reason=EmailSuppression.REASON_UNSUBSCRIBED).delete()

		preference.refresh_from_db()
		return Response(
			{
				"email": preference.email,
				"marketing_opt_in": preference.marketing_opt_in,
				"updated_at": preference.updated_at,
			}
		)


@method_decorator(csrf_exempt, name="dispatch")
class MarketingOneClickUnsubscribeView(APIView):
	permission_classes = [AllowAny]
	authentication_classes = []

	def _resolve_token(self, request) -> str:
		query_token = str(request.query_params.get("token") or "").strip()
		if query_token:
			return query_token
		if isinstance(request.data, dict):
			return str(request.data.get("token") or "").strip()
		return ""

	def _unsubscribe(self, token: str) -> Response:
		if not token:
			return Response({"detail": "token requerido."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			email = validate_unsubscribe_token(token)
		except signing.BadSignature:
			return Response({"detail": "Token inválido o expirado."}, status=status.HTTP_400_BAD_REQUEST)

		preference = get_or_create_preference(email=email)
		set_marketing_preference(
			preference=preference,
			opt_in=False,
			source="SYSTEM",
			notes="one-click unsubscribe",
		)
		EmailSuppression.objects.update_or_create(
			email=email,
			defaults={
				"reason": EmailSuppression.REASON_UNSUBSCRIBED,
				"provider": "kampus",
				"source_event_id": "one-click-unsubscribe",
				"failure_count": 1,
			},
		)

		return Response({"detail": "Suscripción de marketing cancelada."}, status=status.HTTP_200_OK)

	def post(self, request, *args, **kwargs):
		return self._unsubscribe(self._resolve_token(request))

	def get(self, request, *args, **kwargs):
		return self._unsubscribe(self._resolve_token(request))
