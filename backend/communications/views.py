from __future__ import annotations

import csv
import hashlib
import hmac
import io

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsAdmin

from .email_service import send_email
from .models import EmailDelivery, EmailEvent, EmailSuppression, MailgunSettings, MailgunSettingsAudit
from .preferences import (
	get_or_create_preference,
	set_marketing_preference,
	validate_unsubscribe_token,
)
from .runtime_settings import apply_effective_mail_settings, get_effective_mail_settings


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
	effective = get_effective_mail_settings()
	signing_key = str(effective.mailgun_webhook_signing_key or "").strip()
	if not signing_key:
		return not bool(effective.mailgun_webhook_strict)

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


def _mask_secret(value: str) -> str:
	clean = str(value or "").strip()
	if not clean:
		return ""
	if len(clean) <= 4:
		return "*" * len(clean)
	return f"{'*' * (len(clean) - 4)}{clean[-4:]}"


def _serialize_mailgun_settings(config: MailgunSettings | None) -> dict:
	effective = get_effective_mail_settings()
	return {
		"kampus_email_backend": effective.kampus_email_backend,
		"default_from_email": effective.default_from_email,
		"server_email": effective.server_email,
		"mailgun_sender_domain": effective.mailgun_sender_domain,
		"mailgun_api_url": effective.mailgun_api_url,
		"mailgun_webhook_strict": effective.mailgun_webhook_strict,
		"mailgun_api_key_masked": _mask_secret(effective.mailgun_api_key),
		"mailgun_webhook_signing_key_masked": _mask_secret(effective.mailgun_webhook_signing_key),
		"mailgun_api_key_configured": bool(effective.mailgun_api_key),
		"mailgun_webhook_signing_key_configured": bool(effective.mailgun_webhook_signing_key),
		"updated_at": config.updated_at if config else None,
	}


class MailSettingsView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		config = MailgunSettings.objects.order_by("-updated_at").first()
		return Response(_serialize_mailgun_settings(config), status=status.HTTP_200_OK)

	def put(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}

		kampus_email_backend = str(payload.get("kampus_email_backend") or "console").strip().lower()
		if kampus_email_backend not in {"console", "mailgun"}:
			return Response({"detail": "kampus_email_backend debe ser 'console' o 'mailgun'."}, status=status.HTTP_400_BAD_REQUEST)

		default_from_email = str(payload.get("default_from_email") or "").strip().lower()
		server_email = str(payload.get("server_email") or "").strip().lower()
		mailgun_api_key = str(payload.get("mailgun_api_key") or "").strip()
		mailgun_sender_domain = str(payload.get("mailgun_sender_domain") or "").strip().lower()
		mailgun_api_url = str(payload.get("mailgun_api_url") or "").strip()
		mailgun_webhook_signing_key = str(payload.get("mailgun_webhook_signing_key") or "").strip()
		mailgun_webhook_strict = bool(payload.get("mailgun_webhook_strict"))

		if not default_from_email:
			return Response({"detail": "default_from_email es requerido."}, status=status.HTTP_400_BAD_REQUEST)
		if not server_email:
			return Response({"detail": "server_email es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			validate_email(default_from_email)
			validate_email(server_email)
		except ValidationError:
			return Response({"detail": "default_from_email o server_email no son válidos."}, status=status.HTTP_400_BAD_REQUEST)

		if mailgun_api_url and not (mailgun_api_url.startswith("https://") or mailgun_api_url.startswith("http://")):
			return Response({"detail": "mailgun_api_url debe iniciar con http:// o https://."}, status=status.HTTP_400_BAD_REQUEST)

		changed_fields: set[str] = set()
		rotated_api_key = bool(mailgun_api_key)
		rotated_webhook_signing_key = bool(mailgun_webhook_signing_key)

		config = MailgunSettings.objects.order_by("-updated_at").first()
		if config is None:
			changed_fields.update(
				{
					"kampus_email_backend",
					"default_from_email",
					"server_email",
					"mailgun_sender_domain",
					"mailgun_api_url",
					"mailgun_webhook_strict",
				}
			)
			if rotated_api_key:
				changed_fields.add("mailgun_api_key")
			if rotated_webhook_signing_key:
				changed_fields.add("mailgun_webhook_signing_key")

			config = MailgunSettings.objects.create(
				kampus_email_backend=kampus_email_backend,
				default_from_email=default_from_email,
				server_email=server_email,
				mailgun_api_key=mailgun_api_key,
				mailgun_sender_domain=mailgun_sender_domain,
				mailgun_api_url=mailgun_api_url,
				mailgun_webhook_signing_key=mailgun_webhook_signing_key,
				mailgun_webhook_strict=mailgun_webhook_strict,
				updated_by=request.user,
			)
		else:
			if config.kampus_email_backend != kampus_email_backend:
				changed_fields.add("kampus_email_backend")
			if config.default_from_email != default_from_email:
				changed_fields.add("default_from_email")
			if config.server_email != server_email:
				changed_fields.add("server_email")
			if config.mailgun_sender_domain != mailgun_sender_domain:
				changed_fields.add("mailgun_sender_domain")
			if config.mailgun_api_url != mailgun_api_url:
				changed_fields.add("mailgun_api_url")
			if bool(config.mailgun_webhook_strict) != mailgun_webhook_strict:
				changed_fields.add("mailgun_webhook_strict")

			config.kampus_email_backend = kampus_email_backend
			config.default_from_email = default_from_email
			config.server_email = server_email
			config.mailgun_sender_domain = mailgun_sender_domain
			config.mailgun_api_url = mailgun_api_url
			config.mailgun_webhook_strict = mailgun_webhook_strict

			if mailgun_api_key:
				config.mailgun_api_key = mailgun_api_key
				changed_fields.add("mailgun_api_key")
			if mailgun_webhook_signing_key:
				config.mailgun_webhook_signing_key = mailgun_webhook_signing_key
				changed_fields.add("mailgun_webhook_signing_key")

			config.updated_by = request.user
			config.save()

		MailgunSettingsAudit.objects.create(
			settings_ref=config,
			updated_by=request.user,
			changed_fields=sorted(changed_fields),
			rotated_api_key=rotated_api_key,
			rotated_webhook_signing_key=rotated_webhook_signing_key,
		)

		apply_effective_mail_settings()
		return Response(_serialize_mailgun_settings(config), status=status.HTTP_200_OK)


class MailSettingsTestView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, *args, **kwargs):
		test_email = str((request.data or {}).get("test_email") or "").strip().lower()
		if not test_email:
			return Response({"detail": "test_email es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			validate_email(test_email)
		except ValidationError:
			return Response({"detail": "test_email no es válido."}, status=status.HTTP_400_BAD_REQUEST)

		result = send_email(
			recipient_email=test_email,
			subject="[Kampus] Prueba de configuración de correo",
			body_text="Este es un correo de prueba para validar la configuración de Mailgun en Kampus.",
			category="transactional",
		)

		if not result.sent:
			return Response(
				{
					"detail": "El correo de prueba no pudo enviarse.",
					"status": result.delivery.status,
					"error": result.delivery.error_message,
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		return Response(
			{
				"detail": "Correo de prueba enviado correctamente.",
				"status": result.delivery.status,
			},
			status=status.HTTP_200_OK,
		)


class MailSettingsAuditListView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		limit_raw = str(request.query_params.get("limit") or "20").strip()
		offset_raw = str(request.query_params.get("offset") or "0").strip()
		try:
			limit = int(limit_raw)
		except ValueError:
			limit = 20
		try:
			offset = int(offset_raw)
		except ValueError:
			offset = 0
		limit = max(1, min(limit, 100))
		offset = max(0, offset)

		base_qs = MailgunSettingsAudit.objects.select_related("updated_by").order_by("-created_at")
		total = base_qs.count()

		audits = base_qs[offset: offset + limit]

		results = []
		for audit in audits:
			user = audit.updated_by
			results.append(
				{
					"id": audit.id,
					"created_at": audit.created_at,
					"changed_fields": list(audit.changed_fields or []),
					"rotated_api_key": bool(audit.rotated_api_key),
					"rotated_webhook_signing_key": bool(audit.rotated_webhook_signing_key),
					"updated_by": {
						"id": user.id,
						"username": user.username,
						"email": user.email,
						"role": user.role,
					} if user else None,
				}
			)

		return Response(
			{
				"results": results,
				"total": total,
				"limit": limit,
				"offset": offset,
			},
			status=status.HTTP_200_OK,
		)


class MailSettingsAuditCsvExportView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		audits = MailgunSettingsAudit.objects.select_related("updated_by").order_by("-created_at")

		buffer = io.StringIO()
		writer = csv.writer(buffer)
		writer.writerow(
			[
				"id",
				"created_at",
				"updated_by_username",
				"updated_by_email",
				"updated_by_role",
				"changed_fields",
				"rotated_api_key",
				"rotated_webhook_signing_key",
			]
		)

		for audit in audits:
			user = audit.updated_by
			writer.writerow(
				[
					audit.id,
					audit.created_at.isoformat(),
					user.username if user else "",
					user.email if user else "",
					user.role if user else "",
					";".join(list(audit.changed_fields or [])),
					"true" if audit.rotated_api_key else "false",
					"true" if audit.rotated_webhook_signing_key else "false",
				]
			)

		response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
		response["Content-Disposition"] = 'attachment; filename="mailgun_audits.csv"'
		return response


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
