from __future__ import annotations

import csv
from datetime import timedelta
import hashlib
import hmac
import io
import logging
import re

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models
from django.db.utils import OperationalError, ProgrammingError
from django.http import HttpResponse
from django.utils import timezone
from django.utils.text import slugify
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.permissions import IsAdmin, IsSuperAdmin

from .models import EmailDelivery, EmailEvent, EmailSuppression, EmailTemplate, MailgunSettings, MailgunSettingsAudit, WhatsAppSettings
from .models import WhatsAppContact, WhatsAppDelivery, WhatsAppEvent, WhatsAppInstitutionMetric, WhatsAppSuppression, WhatsAppTemplateMap
from .models import WhatsAppTemplateSlaAudit
from django.db.models import Count
from .preferences import (
	get_or_create_preference,
	set_marketing_preference,
	validate_unsubscribe_token,
)
from .runtime_settings import (
	apply_effective_mail_settings,
	apply_effective_whatsapp_settings,
	get_effective_mail_settings,
	get_effective_whatsapp_settings,
)
from .management.commands.notifications_baseline_snapshot import build_notifications_baseline_snapshot
from .code_managed_templates import is_code_managed_template_slug
from .management.commands.sync_email_templates_from_artifact import sync_email_templates_from_artifact
from .template_service import list_template_defaults, render_email_template, send_templated_email
from .whatsapp_service import classify_whatsapp_error, send_whatsapp, send_whatsapp_template


logger = logging.getLogger(__name__)


def _resolve_mail_settings_environment(raw_value: object) -> str:
	environment = str(raw_value or "").strip().lower()
	if environment in {MailgunSettings.ENV_DEVELOPMENT, MailgunSettings.ENV_PRODUCTION}:
		return environment
	if bool(getattr(settings, "IS_PRODUCTION", False)):
		return MailgunSettings.ENV_PRODUCTION
	return MailgunSettings.ENV_DEVELOPMENT


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


def _is_valid_whatsapp_signature(request, raw_body: bytes) -> bool:
	effective = get_effective_whatsapp_settings()
	app_secret = str(effective.app_secret or "").strip()
	if not app_secret:
		return not bool(effective.webhook_strict)

	signature = str(request.headers.get("X-Hub-Signature-256") or "").strip()
	if not signature.startswith("sha256="):
		return False

	received_digest = signature.split("=", 1)[1]
	computed_digest = hmac.new(app_secret.encode("utf-8"), msg=raw_body, digestmod=hashlib.sha256).hexdigest()
	return hmac.compare_digest(received_digest, computed_digest)


def _mask_secret(value: str) -> str:
	clean = str(value or "").strip()
	if not clean:
		return ""
	if len(clean) <= 4:
		return "*" * len(clean)
	return f"{'*' * (len(clean) - 4)}{clean[-4:]}"


def _normalize_whatsapp_phone(value: str) -> str:
	clean = re.sub(r"[^0-9+]", "", str(value or "").strip())
	if clean.startswith("00"):
		clean = f"+{clean[2:]}"
	elif clean and not clean.startswith("+"):
		if len(clean) == 10 and clean.startswith("3"):
			# Colombia local mobile number -> E.164 with country code.
			clean = f"+57{clean}"
		else:
			clean = f"+{clean}"

	if not re.fullmatch(r"\+[1-9][0-9]{7,14}", clean):
		return ""
	return clean


def _serialize_whatsapp_contact(contact: WhatsAppContact | None) -> dict:
	if contact is None:
		return {
			"has_contact": False,
			"phone_number": "",
			"is_active": False,
			"updated_at": None,
		}
	return {
		"has_contact": True,
		"phone_number": contact.phone_number,
		"is_active": bool(contact.is_active),
		"updated_at": contact.updated_at,
	}


def _serialize_whatsapp_template_map(template_map: WhatsAppTemplateMap) -> dict:
	def _actor_snapshot(user):
		if user is None:
			return None
		return {
			"id": user.id,
			"username": user.username,
			"email": user.email,
			"role": user.role,
		}

	return {
		"id": template_map.id,
		"notification_type": template_map.notification_type,
		"template_name": template_map.template_name,
		"language_code": template_map.language_code,
		"body_parameter_names": list(template_map.body_parameter_names or []),
		"default_components": list(template_map.default_components or []),
		"category": template_map.category,
		"is_active": bool(template_map.is_active),
		"approval_status": template_map.approval_status,
		"submitted_at": template_map.submitted_at,
		"submitted_by": template_map.submitted_by_id,
		"submitted_by_user": _actor_snapshot(template_map.submitted_by),
		"approved_at": template_map.approved_at,
		"approved_by": template_map.approved_by_id,
		"approved_by_user": _actor_snapshot(template_map.approved_by),
		"rejected_at": template_map.rejected_at,
		"rejected_by": template_map.rejected_by_id,
		"rejected_by_user": _actor_snapshot(template_map.rejected_by),
		"rejection_reason": template_map.rejection_reason,
		"updated_at": template_map.updated_at,
	}


def _clear_whatsapp_template_approval(template_map: WhatsAppTemplateMap) -> None:
	template_map.approval_status = WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT
	template_map.submitted_at = None
	template_map.submitted_by = None
	template_map.approved_at = None
	template_map.approved_by = None
	template_map.rejected_at = None
	template_map.rejected_by = None
	template_map.rejection_reason = ""


def _normalize_mailgun_api_url(value: str) -> str:
	clean = str(value or "").strip().rstrip("/")
	if not clean:
		return ""
	if clean in {"https://api.mailgun.net", "https://api.eu.mailgun.net"}:
		return f"{clean}/v3"
	return clean


def _serialize_mailgun_settings(config: MailgunSettings | None, *, environment: str | None = None) -> dict:
	effective = get_effective_mail_settings(environment=(config.environment if config else environment))
	return {
		"environment": effective.environment,
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


def _serialize_email_template(template: EmailTemplate) -> dict:
	return {
		"id": template.id,
		"slug": template.slug,
		"name": template.name,
		"description": template.description,
		"template_type": template.template_type,
		"category": template.category,
		"subject_template": template.subject_template,
		"body_text_template": template.body_text_template,
		"body_html_template": template.body_html_template,
		"allowed_variables": list(template.allowed_variables or []),
		"is_active": bool(template.is_active),
		"managed_by_code": bool(is_code_managed_template_slug(template.slug)),
		"updated_at": template.updated_at,
	}


def _serialize_whatsapp_settings(config: WhatsAppSettings | None, *, environment: str | None = None) -> dict:
	effective = get_effective_whatsapp_settings(environment=(config.environment if config else environment))
	updated_by = config.updated_by if config else None
	return {
		"environment": effective.environment,
		"enabled": bool(effective.enabled),
		"provider": effective.provider,
		"graph_base_url": effective.graph_base_url,
		"api_version": effective.api_version,
		"phone_number_id": effective.phone_number_id,
		"access_token_masked": _mask_secret(effective.access_token),
		"app_secret_masked": _mask_secret(effective.app_secret),
		"webhook_verify_token_masked": _mask_secret(effective.webhook_verify_token),
		"webhook_strict": bool(effective.webhook_strict),
		"http_timeout_seconds": int(effective.http_timeout_seconds),
		"send_mode": effective.send_mode,
		"template_fallback_name": effective.template_fallback_name,
		"template_sla_warning_pending_hours": int(effective.template_sla_warning_pending_hours),
		"template_sla_critical_pending_hours": int(effective.template_sla_critical_pending_hours),
		"template_sla_warning_approval_hours": int(effective.template_sla_warning_approval_hours),
		"template_sla_critical_approval_hours": int(effective.template_sla_critical_approval_hours),
		"access_token_configured": bool(effective.access_token),
		"app_secret_configured": bool(effective.app_secret),
		"webhook_verify_token_configured": bool(effective.webhook_verify_token),
		"updated_by": {
			"id": updated_by.id,
			"username": updated_by.username,
			"email": updated_by.email,
			"role": updated_by.role,
		} if updated_by else None,
		"updated_at": config.updated_at if config else None,
	}


class MailSettingsView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
		config = MailgunSettings.objects.filter(environment=environment).order_by("-updated_at").first()
		return Response(_serialize_mailgun_settings(config, environment=environment), status=status.HTTP_200_OK)

	def put(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}
		environment = _resolve_mail_settings_environment(request.query_params.get("environment") or payload.get("environment"))
		config = MailgunSettings.objects.filter(environment=environment).order_by("-updated_at").first()

		kampus_email_backend = str(payload.get("kampus_email_backend") or "console").strip().lower()
		if kampus_email_backend not in {"console", "mailgun"}:
			return Response({"detail": "kampus_email_backend debe ser 'console' o 'mailgun'."}, status=status.HTTP_400_BAD_REQUEST)

		default_from_email = str(payload.get("default_from_email") or "").strip().lower()
		server_email = str(payload.get("server_email") or "").strip().lower()
		mailgun_api_key = str(payload.get("mailgun_api_key") or "").strip()
		mailgun_sender_domain = str(payload.get("mailgun_sender_domain") or "").strip().lower()
		mailgun_api_url = _normalize_mailgun_api_url(payload.get("mailgun_api_url") or "")
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
		if mailgun_api_url and not mailgun_api_url.endswith("/v3"):
			return Response({"detail": "mailgun_api_url debe terminar en /v3 (ej: https://api.mailgun.net/v3)."}, status=status.HTTP_400_BAD_REQUEST)

		effective_api_key = mailgun_api_key or (config.mailgun_api_key if config else "")
		effective_webhook_key = mailgun_webhook_signing_key or (config.mailgun_webhook_signing_key if config else "")

		if kampus_email_backend == "mailgun":
			if not mailgun_sender_domain:
				return Response({"detail": "mailgun_sender_domain es requerido cuando el backend es mailgun."}, status=status.HTTP_400_BAD_REQUEST)
			if not effective_api_key:
				return Response({"detail": "mailgun_api_key es requerido cuando el backend es mailgun."}, status=status.HTTP_400_BAD_REQUEST)
			if str(effective_api_key).lower().startswith("pubkey-"):
				return Response({"detail": "mailgun_api_key no puede ser una public key (pubkey-...). Usa una private key de Mailgun."}, status=status.HTTP_400_BAD_REQUEST)
			if mailgun_webhook_strict and not effective_webhook_key:
				return Response({"detail": "mailgun_webhook_signing_key es requerido cuando mailgun_webhook_strict=true."}, status=status.HTTP_400_BAD_REQUEST)

		changed_fields: set[str] = set()
		rotated_api_key = bool(mailgun_api_key)
		rotated_webhook_signing_key = bool(mailgun_webhook_signing_key)
		if config is None:
			changed_fields.update(
				{
					"environment",
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
				environment=environment,
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
			if config.environment != environment:
				changed_fields.add("environment")
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

			config.environment = environment
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
		return Response(_serialize_mailgun_settings(config, environment=environment), status=status.HTTP_200_OK)


class WhatsAppSettingsView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
		try:
			config = WhatsAppSettings.objects.filter(environment=environment).order_by("-updated_at").first()
		except (OperationalError, ProgrammingError):
			# Keep endpoint operable even when schema is temporarily out-of-sync.
			config = None
		return Response(_serialize_whatsapp_settings(config, environment=environment), status=status.HTTP_200_OK)

	def put(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}
		environment = _resolve_mail_settings_environment(request.query_params.get("environment") or payload.get("environment"))
		try:
			config = WhatsAppSettings.objects.filter(environment=environment).order_by("-updated_at").first()
		except (OperationalError, ProgrammingError):
			return Response(
				{"detail": "La tabla de configuración de WhatsApp no está disponible. Ejecuta migraciones y reintenta."},
				status=status.HTTP_503_SERVICE_UNAVAILABLE,
			)

		provider = str(payload.get("provider") or "meta_cloud_api").strip().lower()
		graph_base_url = str(payload.get("graph_base_url") or "https://graph.facebook.com").strip().rstrip("/")
		api_version = str(payload.get("api_version") or "v21.0").strip()
		phone_number_id = str(payload.get("phone_number_id") or "").strip()
		access_token = str(payload.get("access_token") or "").strip()
		app_secret = str(payload.get("app_secret") or "").strip()
		webhook_verify_token = str(payload.get("webhook_verify_token") or "").strip()
		http_timeout_seconds = int(payload.get("http_timeout_seconds") or 12)
		send_mode = str(payload.get("send_mode") or "template").strip().lower()
		template_fallback_name = str(payload.get("template_fallback_name") or "").strip()
		template_sla_warning_pending_hours = int(payload.get("template_sla_warning_pending_hours") or 24)
		template_sla_critical_pending_hours = int(payload.get("template_sla_critical_pending_hours") or 72)
		template_sla_warning_approval_hours = int(payload.get("template_sla_warning_approval_hours") or 24)
		template_sla_critical_approval_hours = int(payload.get("template_sla_critical_approval_hours") or 72)
		enabled = bool(payload.get("enabled", False))
		webhook_strict = bool(payload.get("webhook_strict", True))

		previous_sla = {
			"warning_pending": int((config.template_sla_warning_pending_hours if config else 24) or 24),
			"critical_pending": int((config.template_sla_critical_pending_hours if config else 72) or 72),
			"warning_approval": int((config.template_sla_warning_approval_hours if config else 24) or 24),
			"critical_approval": int((config.template_sla_critical_approval_hours if config else 72) or 72),
		}

		if not graph_base_url.startswith("http://") and not graph_base_url.startswith("https://"):
			return Response({"detail": "graph_base_url debe iniciar con http:// o https://."}, status=status.HTTP_400_BAD_REQUEST)
		if send_mode not in {"template", "text"}:
			return Response({"detail": "send_mode debe ser 'template' o 'text'."}, status=status.HTTP_400_BAD_REQUEST)
		if environment == MailgunSettings.ENV_PRODUCTION and send_mode == "text":
			send_mode = "template"
		if http_timeout_seconds < 3 or http_timeout_seconds > 120:
			return Response({"detail": "http_timeout_seconds debe estar entre 3 y 120."}, status=status.HTTP_400_BAD_REQUEST)
		if min(
			template_sla_warning_pending_hours,
			template_sla_critical_pending_hours,
			template_sla_warning_approval_hours,
			template_sla_critical_approval_hours,
		) < 1:
			return Response({"detail": "Los umbrales SLA deben ser mayores o iguales a 1 hora."}, status=status.HTTP_400_BAD_REQUEST)
		if template_sla_warning_pending_hours > template_sla_critical_pending_hours:
			return Response({"detail": "template_sla_warning_pending_hours no puede ser mayor a template_sla_critical_pending_hours."}, status=status.HTTP_400_BAD_REQUEST)
		if template_sla_warning_approval_hours > template_sla_critical_approval_hours:
			return Response({"detail": "template_sla_warning_approval_hours no puede ser mayor a template_sla_critical_approval_hours."}, status=status.HTTP_400_BAD_REQUEST)

		effective_access_token = access_token or (config.access_token if config else "")
		effective_phone_number_id = phone_number_id or (config.phone_number_id if config else "")
		if enabled and (not effective_access_token or not effective_phone_number_id):
			return Response({"detail": "Para habilitar WhatsApp, phone_number_id y access_token son obligatorios."}, status=status.HTTP_400_BAD_REQUEST)

		if config is None:
			config = WhatsAppSettings.objects.create(
				environment=environment,
				enabled=enabled,
				provider=provider,
				graph_base_url=graph_base_url,
				api_version=api_version,
				phone_number_id=phone_number_id,
				access_token=access_token,
				app_secret=app_secret,
				webhook_verify_token=webhook_verify_token,
				webhook_strict=webhook_strict,
				http_timeout_seconds=http_timeout_seconds,
				send_mode=send_mode,
				template_fallback_name=template_fallback_name,
				template_sla_warning_pending_hours=template_sla_warning_pending_hours,
				template_sla_critical_pending_hours=template_sla_critical_pending_hours,
				template_sla_warning_approval_hours=template_sla_warning_approval_hours,
				template_sla_critical_approval_hours=template_sla_critical_approval_hours,
				updated_by=request.user,
			)
		else:
			config.enabled = enabled
			config.provider = provider
			config.graph_base_url = graph_base_url
			config.api_version = api_version
			config.webhook_strict = webhook_strict
			config.http_timeout_seconds = http_timeout_seconds
			config.send_mode = send_mode
			config.template_fallback_name = template_fallback_name
			config.template_sla_warning_pending_hours = template_sla_warning_pending_hours
			config.template_sla_critical_pending_hours = template_sla_critical_pending_hours
			config.template_sla_warning_approval_hours = template_sla_warning_approval_hours
			config.template_sla_critical_approval_hours = template_sla_critical_approval_hours
			if phone_number_id:
				config.phone_number_id = phone_number_id
			if access_token:
				config.access_token = access_token
			if app_secret:
				config.app_secret = app_secret
			if webhook_verify_token:
				config.webhook_verify_token = webhook_verify_token
			config.updated_by = request.user
			config.save()

		if (
			previous_sla["warning_pending"] != template_sla_warning_pending_hours
			or previous_sla["critical_pending"] != template_sla_critical_pending_hours
			or previous_sla["warning_approval"] != template_sla_warning_approval_hours
			or previous_sla["critical_approval"] != template_sla_critical_approval_hours
		):
			WhatsAppTemplateSlaAudit.objects.create(
				settings_ref=config,
				environment=environment,
				updated_by=request.user,
				previous_warning_pending_hours=previous_sla["warning_pending"],
				new_warning_pending_hours=template_sla_warning_pending_hours,
				previous_critical_pending_hours=previous_sla["critical_pending"],
				new_critical_pending_hours=template_sla_critical_pending_hours,
				previous_warning_approval_hours=previous_sla["warning_approval"],
				new_warning_approval_hours=template_sla_warning_approval_hours,
				previous_critical_approval_hours=previous_sla["critical_approval"],
				new_critical_approval_hours=template_sla_critical_approval_hours,
			)

		apply_effective_whatsapp_settings(environment=environment)
		return Response(_serialize_whatsapp_settings(config, environment=environment), status=status.HTTP_200_OK)


class MailSettingsTestView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment") or (request.data or {}).get("environment"))
		test_email = str((request.data or {}).get("test_email") or "").strip().lower()
		if not test_email:
			logger.warning("Mailgun test email rejected: empty test_email by user_id=%s", getattr(request.user, "id", None))
			return Response({"detail": "test_email es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		try:
			validate_email(test_email)
		except ValidationError:
			logger.warning("Mailgun test email rejected: invalid format '%s' by user_id=%s", test_email, getattr(request.user, "id", None))
			return Response({"detail": "test_email no es válido."}, status=status.HTTP_400_BAD_REQUEST)

		result = send_templated_email(
			slug="mail-settings-test",
			recipient_email=test_email,
			context={"environment": environment},
			category="transactional",
			environment=environment,
		)

		if not result.sent:
			logger.warning(
				"Mailgun test email failed for '%s': status=%s error=%s user_id=%s",
				test_email,
				result.delivery.status,
				result.delivery.error_message,
				getattr(request.user, "id", None),
			)
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


class WhatsAppSettingsTestView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment") or (request.data or {}).get("environment"))
		payload = request.data if isinstance(request.data, dict) else {}

		test_phone = _normalize_whatsapp_phone(payload.get("test_phone") or "")
		if not test_phone:
			return Response({"detail": "test_phone es requerido y debe estar en formato E.164."}, status=status.HTTP_400_BAD_REQUEST)

		apply_effective_whatsapp_settings(environment=environment)
		effective = get_effective_whatsapp_settings(environment=environment)

		test_mode = str(payload.get("mode") or "template").strip().lower()
		if test_mode not in {"template", "text"}:
			return Response({"detail": "mode debe ser 'template' o 'text'."}, status=status.HTTP_400_BAD_REQUEST)

		test_message = str(payload.get("message") or "").strip() or "Prueba de WhatsApp desde Kampus."
		if len(test_message) > 4096:
			return Response({"detail": "message no puede exceder 4096 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

		template_name = str(payload.get("template_name") or effective.template_fallback_name or "hello_world").strip()
		language_code = str(payload.get("language_code") or "es_CO").strip() or "es_CO"
		template_header_text = str(payload.get("template_header_text") or "").strip()
		body_parameters_value = payload.get("body_parameters")
		body_parameters: list[str] = []
		if isinstance(body_parameters_value, list):
			body_parameters = [str(item).strip() for item in body_parameters_value if str(item).strip()]
		elif isinstance(body_parameters_value, str):
			body_parameters = [item.strip() for item in body_parameters_value.split("|") if item.strip()]

		components_value = payload.get("components")
		template_components: list[dict] | None = None
		if isinstance(components_value, list):
			template_components = components_value
		elif template_header_text or body_parameters:
			template_components = []
			if template_header_text:
				template_components.append(
					{
						"type": "header",
						"parameters": [{"type": "text", "text": template_header_text}],
					}
				)
			if body_parameters:
				template_components.append(
					{
						"type": "body",
						"parameters": [{"type": "text", "text": value} for value in body_parameters],
					}
				)

		try:
			if test_mode == "text":
				result = send_whatsapp(
					recipient_phone=test_phone,
					message_text=test_message,
					category="system-test",
					idempotency_key=f"whatsapp-settings-test:text:{environment}:{test_phone}:{timezone.now().strftime('%Y%m%d%H%M%S')}",
				)
			else:
				result = send_whatsapp_template(
					recipient_phone=test_phone,
					template_name=template_name,
					language_code=language_code,
					components=template_components,
					category="utility",
					idempotency_key=f"whatsapp-settings-test:template:{environment}:{test_phone}:{timezone.now().strftime('%Y%m%d%H%M%S')}",
				)
		except RuntimeError as exc:
			return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
		except Exception as exc:  # pragma: no cover - defensive guard
			logger.exception("Unexpected WhatsApp test send error", extra={"user_id": getattr(request.user, "id", None)})
			return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		if not result.sent:
			return Response(
				{
					"detail": "El mensaje de prueba no pudo enviarse.",
					"mode": test_mode,
					"status": result.delivery.status,
					"error": result.delivery.error_message,
					"error_code": result.delivery.error_code,
					"delivery_id": result.delivery.id,
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		return Response(
			{
				"detail": "Mensaje de prueba enviado correctamente.",
				"mode": test_mode,
				"status": result.delivery.status,
				"delivery_id": result.delivery.id,
				"provider_message_id": result.delivery.provider_message_id,
			},
			status=status.HTTP_200_OK,
		)


class WhatsAppRecentDeliveriesView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		limit_raw = str(request.query_params.get("limit") or "20").strip()
		try:
			limit = int(limit_raw)
		except ValueError:
			limit = 20
		limit = max(1, min(limit, 100))

		deliveries = WhatsAppDelivery.objects.order_by("-created_at")[:limit]
		results = []
		for delivery in deliveries:
			results.append(
				{
					"id": delivery.id,
					"recipient_phone": delivery.recipient_phone,
					"status": delivery.status,
					"provider_message_id": delivery.provider_message_id,
					"error_code": delivery.error_code,
					"skip_reason": delivery.skip_reason,
					"error_message": delivery.error_message,
					"created_at": delivery.created_at,
					"updated_at": delivery.updated_at,
				}
			)

		return Response({"results": results}, status=status.HTTP_200_OK)


class EmailTemplateListView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		for default in list_template_defaults():
			EmailTemplate.objects.get_or_create(
				slug=default["slug"],
				defaults={
					"name": default["name"],
					"description": default["description"],
					"template_type": default["template_type"],
					"category": default["category"],
					"subject_template": default["subject_template"],
					"body_text_template": default["body_text_template"],
					"body_html_template": default["body_html_template"],
					"allowed_variables": default["allowed_variables"],
					"is_active": True,
				},
			)

		templates = EmailTemplate.objects.order_by("slug")
		results = [_serialize_email_template(template) for template in templates]
		return Response({"results": results}, status=status.HTTP_200_OK)


class EmailTemplateDetailView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, slug: str, *args, **kwargs):
		template = EmailTemplate.objects.filter(slug=slug).first()
		if template is None:
			return Response({"detail": "Plantilla no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		return Response(_serialize_email_template(template), status=status.HTTP_200_OK)

	def put(self, request, slug: str, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}

		normalized_slug = slugify(str(payload.get("slug") or slug).strip())
		if not normalized_slug:
			return Response({"detail": "slug es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		if is_code_managed_template_slug(slug) or is_code_managed_template_slug(normalized_slug):
			return Response(
				{
					"detail": (
						"Este slug esta gestionado por codigo (React Email) y no permite edicion manual. "
						"Ejecuta sync_email_templates_from_artifact para actualizarlo."
					)
				},
				status=status.HTTP_409_CONFLICT,
			)

		name = str(payload.get("name") or "").strip()
		subject_template = str(payload.get("subject_template") or "").strip()
		if not name:
			return Response({"detail": "name es requerido."}, status=status.HTTP_400_BAD_REQUEST)
		if not subject_template:
			return Response({"detail": "subject_template es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		template_type = str(payload.get("template_type") or EmailTemplate.TYPE_TRANSACTIONAL).strip().lower()
		if template_type not in {EmailTemplate.TYPE_TRANSACTIONAL, EmailTemplate.TYPE_MARKETING}:
			return Response({"detail": "template_type debe ser 'transactional' o 'marketing'."}, status=status.HTTP_400_BAD_REQUEST)

		allowed_variables = payload.get("allowed_variables") or []
		if not isinstance(allowed_variables, list) or not all(isinstance(item, str) for item in allowed_variables):
			return Response({"detail": "allowed_variables debe ser una lista de strings."}, status=status.HTTP_400_BAD_REQUEST)

		template = EmailTemplate.objects.filter(slug=slug).first()
		if template is None and normalized_slug != slug:
			template = EmailTemplate.objects.filter(slug=normalized_slug).first()

		if template is None and EmailTemplate.objects.filter(slug=normalized_slug).exists():
			return Response({"detail": "Ya existe otra plantilla con ese slug."}, status=status.HTTP_400_BAD_REQUEST)

		if template is None:
			template = EmailTemplate.objects.create(
				slug=normalized_slug,
				name=name,
				description=str(payload.get("description") or "").strip(),
				template_type=template_type,
				category=str(payload.get("category") or "transactional").strip() or "transactional",
				subject_template=subject_template,
				body_text_template=str(payload.get("body_text_template") or ""),
				body_html_template=str(payload.get("body_html_template") or ""),
				allowed_variables=allowed_variables,
				is_active=bool(payload.get("is_active", True)),
				updated_by=request.user,
			)
		else:
			if normalized_slug != template.slug and EmailTemplate.objects.filter(slug=normalized_slug).exclude(id=template.id).exists():
				return Response({"detail": "Ya existe otra plantilla con ese slug."}, status=status.HTTP_400_BAD_REQUEST)

			template.slug = normalized_slug
			template.name = name
			template.description = str(payload.get("description") or "").strip()
			template.template_type = template_type
			template.category = str(payload.get("category") or "transactional").strip() or "transactional"
			template.subject_template = subject_template
			template.body_text_template = str(payload.get("body_text_template") or "")
			template.body_html_template = str(payload.get("body_html_template") or "")
			template.allowed_variables = allowed_variables
			template.is_active = bool(payload.get("is_active", True))
			template.updated_by = request.user
			template.save()

		return Response(_serialize_email_template(template), status=status.HTTP_200_OK)


class EmailTemplatePreviewView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, slug: str, *args, **kwargs):
		template = EmailTemplate.objects.filter(slug=slug).first()
		if template is None:
			return Response({"detail": "Plantilla no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		context = (request.data or {}).get("context") if isinstance(request.data, dict) else {}
		if context is None:
			context = {}
		if not isinstance(context, dict):
			return Response({"detail": "context debe ser un objeto JSON."}, status=status.HTTP_400_BAD_REQUEST)

		rendered = render_email_template(slug=slug, context=context)
		return Response(
			{
				"subject": rendered.subject,
				"body_text": rendered.body_text,
				"body_html": rendered.body_html,
			},
			status=status.HTTP_200_OK,
		)


class EmailTemplateSyncView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}
		dry_run = bool(payload.get("dry_run", False))
		deactivate_missing = bool(payload.get("deactivate_missing", False))

		artifact_raw = str(payload.get("artifact_path") or "").strip()
		from pathlib import Path
		from communications.management.commands.sync_email_templates_from_artifact import _default_artifact_path

		artifact_path = Path(artifact_raw) if artifact_raw else _default_artifact_path()

		try:
			summary = sync_email_templates_from_artifact(
				artifact_path=artifact_path,
				dry_run=dry_run,
				deactivate_missing=deactivate_missing,
			)
		except Exception as exc:
			return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

		prefix = "[DRY-RUN] " if dry_run else ""
		return Response(
			{
				"detail": (
					f"{prefix}Sincronizacion completada: "
					f"created={summary['created']}, updated={summary['updated']}, "
					f"unchanged={summary['unchanged']}, deactivated={summary['deactivated']}"
				),
				"summary": summary,
			},
			status=status.HTTP_200_OK,
		)


class EmailTemplateSendTestView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, slug: str, *args, **kwargs):
		test_email = str((request.data or {}).get("test_email") or "").strip().lower()
		if not test_email:
			return Response({"detail": "test_email es requerido."}, status=status.HTTP_400_BAD_REQUEST)
		try:
			validate_email(test_email)
		except ValidationError:
			return Response({"detail": "test_email no es válido."}, status=status.HTTP_400_BAD_REQUEST)

		context = (request.data or {}).get("context") if isinstance(request.data, dict) else {}
		if context is None:
			context = {}
		if not isinstance(context, dict):
			return Response({"detail": "context debe ser un objeto JSON."}, status=status.HTTP_400_BAD_REQUEST)

		result = send_templated_email(
			slug=slug,
			recipient_email=test_email,
			context=context,
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
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
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

		base_qs = MailgunSettingsAudit.objects.select_related("updated_by", "settings_ref").filter(settings_ref__environment=environment).order_by("-created_at")
		total = base_qs.count()

		audits = base_qs[offset: offset + limit]

		results = []
		for audit in audits:
			user = audit.updated_by
			results.append(
				{
					"id": audit.id,
					"environment": audit.settings_ref.environment if audit.settings_ref else environment,
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
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
		audits = MailgunSettingsAudit.objects.select_related("updated_by", "settings_ref").filter(settings_ref__environment=environment).order_by("-created_at")

		buffer = io.StringIO()
		writer = csv.writer(buffer)
		writer.writerow(
			[
				"id",
				"environment",
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
					audit.settings_ref.environment if audit.settings_ref else environment,
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


class WhatsAppTemplateSlaAuditListView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
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

		base_qs = WhatsAppTemplateSlaAudit.objects.select_related("updated_by", "settings_ref").filter(environment=environment).order_by("-created_at")
		total = base_qs.count()
		audits = base_qs[offset: offset + limit]

		results = []
		for audit in audits:
			user = audit.updated_by
			results.append(
				{
					"id": audit.id,
					"environment": audit.environment,
					"created_at": audit.created_at,
					"previous_warning_pending_hours": audit.previous_warning_pending_hours,
					"new_warning_pending_hours": audit.new_warning_pending_hours,
					"previous_critical_pending_hours": audit.previous_critical_pending_hours,
					"new_critical_pending_hours": audit.new_critical_pending_hours,
					"previous_warning_approval_hours": audit.previous_warning_approval_hours,
					"new_warning_approval_hours": audit.new_warning_approval_hours,
					"previous_critical_approval_hours": audit.previous_critical_approval_hours,
					"new_critical_approval_hours": audit.new_critical_approval_hours,
					"updated_by": {
						"id": user.id,
						"username": user.username,
						"email": user.email,
						"role": user.role,
					} if user else None,
				}
			)

		return Response({"results": results, "total": total, "limit": limit, "offset": offset}, status=status.HTTP_200_OK)


class WhatsAppTemplateSlaAuditCsvExportView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		environment = _resolve_mail_settings_environment(request.query_params.get("environment"))
		audits = WhatsAppTemplateSlaAudit.objects.select_related("updated_by").filter(environment=environment).order_by("-created_at")

		buffer = io.StringIO()
		writer = csv.writer(buffer)
		writer.writerow(
			[
				"id",
				"environment",
				"created_at",
				"updated_by_username",
				"updated_by_email",
				"updated_by_role",
				"previous_warning_pending_hours",
				"new_warning_pending_hours",
				"previous_critical_pending_hours",
				"new_critical_pending_hours",
				"previous_warning_approval_hours",
				"new_warning_approval_hours",
				"previous_critical_approval_hours",
				"new_critical_approval_hours",
			]
		)

		for audit in audits:
			user = audit.updated_by
			writer.writerow(
				[
					audit.id,
					audit.environment,
					audit.created_at.isoformat(),
					user.username if user else "",
					user.email if user else "",
					user.role if user else "",
					audit.previous_warning_pending_hours,
					audit.new_warning_pending_hours,
					audit.previous_critical_pending_hours,
					audit.new_critical_pending_hours,
					audit.previous_warning_approval_hours,
					audit.new_warning_approval_hours,
					audit.previous_critical_approval_hours,
					audit.new_critical_approval_hours,
				]
			)

		response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
		response["Content-Disposition"] = f'attachment; filename="whatsapp_template_sla_audits_{environment}.csv"'
		return response


class WhatsAppTemplateMapListView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		status_filter = str(request.query_params.get("approval_status") or "").strip().lower()
		template_maps = WhatsAppTemplateMap.objects.select_related(
			"submitted_by",
			"approved_by",
			"rejected_by",
		).order_by("notification_type")
		if status_filter in {
			WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT,
			WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED,
			WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
			WhatsAppTemplateMap.APPROVAL_STATUS_REJECTED,
		}:
			template_maps = template_maps.filter(approval_status=status_filter)
		results = [_serialize_whatsapp_template_map(item) for item in template_maps]
		return Response({"results": results}, status=status.HTTP_200_OK)

	def put(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}

		notification_type = str(payload.get("notification_type") or "").strip().upper()
		template_name = str(payload.get("template_name") or "").strip()
		language_code = str(payload.get("language_code") or "es_CO").strip() or "es_CO"
		body_parameter_names = payload.get("body_parameter_names") or []
		default_components = payload.get("default_components") or []
		category = str(payload.get("category") or WhatsAppTemplateMap.CATEGORY_UTILITY).strip().lower()
		is_active = bool(payload.get("is_active", True))

		if not notification_type:
			return Response({"detail": "notification_type es requerido."}, status=status.HTTP_400_BAD_REQUEST)
		if not template_name:
			return Response({"detail": "template_name es requerido."}, status=status.HTTP_400_BAD_REQUEST)
		if not isinstance(body_parameter_names, list) or not all(isinstance(item, str) for item in body_parameter_names):
			return Response({"detail": "body_parameter_names debe ser una lista de strings."}, status=status.HTTP_400_BAD_REQUEST)
		if not isinstance(default_components, list):
			return Response({"detail": "default_components debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)
		valid_categories = {
			WhatsAppTemplateMap.CATEGORY_UTILITY,
			WhatsAppTemplateMap.CATEGORY_AUTHENTICATION,
			WhatsAppTemplateMap.CATEGORY_MARKETING,
		}
		if category not in valid_categories:
			return Response({"detail": "category inválida."}, status=status.HTTP_400_BAD_REQUEST)

		template_map, created = WhatsAppTemplateMap.objects.update_or_create(
			notification_type=notification_type,
			defaults={
				"template_name": template_name,
				"language_code": language_code,
				"body_parameter_names": body_parameter_names,
				"default_components": default_components,
				"category": category,
				"is_active": is_active,
				"updated_by": request.user,
			},
		)
		if not created:
			_clear_whatsapp_template_approval(template_map)
			template_map.updated_by = request.user
			template_map.save(
				update_fields=[
					"approval_status",
					"submitted_at",
					"submitted_by",
					"approved_at",
					"approved_by",
					"rejected_at",
					"rejected_by",
					"rejection_reason",
					"updated_by",
					"updated_at",
				]
			)
		return Response(_serialize_whatsapp_template_map(template_map), status=status.HTTP_200_OK)


class WhatsAppTemplateMapDetailView(APIView):
	permission_classes = [IsAdmin]

	def put(self, request, map_id: int, *args, **kwargs):
		template_map = WhatsAppTemplateMap.objects.filter(id=map_id).first()
		if template_map is None:
			return Response({"detail": "Mapeo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		payload = request.data if isinstance(request.data, dict) else {}
		if "template_name" in payload:
			template_map.template_name = str(payload.get("template_name") or "").strip()
		if "language_code" in payload:
			template_map.language_code = str(payload.get("language_code") or "es_CO").strip() or "es_CO"
		if "body_parameter_names" in payload:
			body_parameter_names = payload.get("body_parameter_names")
			if not isinstance(body_parameter_names, list) or not all(isinstance(item, str) for item in body_parameter_names):
				return Response({"detail": "body_parameter_names debe ser una lista de strings."}, status=status.HTTP_400_BAD_REQUEST)
			template_map.body_parameter_names = body_parameter_names
		if "default_components" in payload:
			default_components = payload.get("default_components")
			if not isinstance(default_components, list):
				return Response({"detail": "default_components debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)
			template_map.default_components = default_components
		if "category" in payload:
			category = str(payload.get("category") or "").strip().lower()
			if category not in {
				WhatsAppTemplateMap.CATEGORY_UTILITY,
				WhatsAppTemplateMap.CATEGORY_AUTHENTICATION,
				WhatsAppTemplateMap.CATEGORY_MARKETING,
			}:
				return Response({"detail": "category inválida."}, status=status.HTTP_400_BAD_REQUEST)
			template_map.category = category
		if "is_active" in payload:
			template_map.is_active = bool(payload.get("is_active"))
		if "notification_type" in payload:
			notification_type = str(payload.get("notification_type") or "").strip().upper()
			if not notification_type:
				return Response({"detail": "notification_type inválido."}, status=status.HTTP_400_BAD_REQUEST)
			template_map.notification_type = notification_type

		if not template_map.template_name:
			return Response({"detail": "template_name es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		_clear_whatsapp_template_approval(template_map)
		template_map.updated_by = request.user
		template_map.save()
		return Response(_serialize_whatsapp_template_map(template_map), status=status.HTTP_200_OK)

	def delete(self, request, map_id: int, *args, **kwargs):
		template_map = WhatsAppTemplateMap.objects.filter(id=map_id).first()
		if template_map is None:
			return Response({"detail": "Mapeo no encontrado."}, status=status.HTTP_404_NOT_FOUND)
		template_map.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


class WhatsAppTemplateMapSubmitView(APIView):
	permission_classes = [IsAdmin]

	def post(self, request, map_id: int, *args, **kwargs):
		template_map = WhatsAppTemplateMap.objects.filter(id=map_id).first()
		if template_map is None:
			return Response({"detail": "Mapeo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		if template_map.approval_status == WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED:
			return Response(
				{"detail": "El template ya está aprobado. Debes editarlo para reenviarlo."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		template_map.approval_status = WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED
		template_map.submitted_at = timezone.now()
		template_map.submitted_by = request.user
		template_map.approved_at = None
		template_map.approved_by = None
		template_map.rejected_at = None
		template_map.rejected_by = None
		template_map.rejection_reason = ""
		template_map.updated_by = request.user
		template_map.save(
			update_fields=[
				"approval_status",
				"submitted_at",
				"submitted_by",
				"approved_at",
				"approved_by",
				"rejected_at",
				"rejected_by",
				"rejection_reason",
				"updated_by",
				"updated_at",
			]
		)
		return Response(_serialize_whatsapp_template_map(template_map), status=status.HTTP_200_OK)


class WhatsAppTemplateMapApproveView(APIView):
	permission_classes = [IsSuperAdmin]

	def post(self, request, map_id: int, *args, **kwargs):
		template_map = WhatsAppTemplateMap.objects.filter(id=map_id).first()
		if template_map is None:
			return Response({"detail": "Mapeo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		if template_map.approval_status != WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED:
			return Response(
				{"detail": "Solo se pueden aprobar templates en estado submitted."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		template_map.approval_status = WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED
		template_map.approved_at = timezone.now()
		template_map.approved_by = request.user
		template_map.rejected_at = None
		template_map.rejected_by = None
		template_map.rejection_reason = ""
		template_map.updated_by = request.user
		template_map.save(
			update_fields=[
				"approval_status",
				"approved_at",
				"approved_by",
				"rejected_at",
				"rejected_by",
				"rejection_reason",
				"updated_by",
				"updated_at",
			]
		)
		return Response(_serialize_whatsapp_template_map(template_map), status=status.HTTP_200_OK)


class WhatsAppTemplateMapRejectView(APIView):
	permission_classes = [IsSuperAdmin]

	def post(self, request, map_id: int, *args, **kwargs):
		template_map = WhatsAppTemplateMap.objects.filter(id=map_id).first()
		if template_map is None:
			return Response({"detail": "Mapeo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		if template_map.approval_status != WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED:
			return Response(
				{"detail": "Solo se pueden rechazar templates en estado submitted."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		reason = str((request.data or {}).get("reason") or "").strip()
		if not reason:
			return Response({"detail": "reason es requerido."}, status=status.HTTP_400_BAD_REQUEST)

		template_map.approval_status = WhatsAppTemplateMap.APPROVAL_STATUS_REJECTED
		template_map.rejected_at = timezone.now()
		template_map.rejected_by = request.user
		template_map.rejection_reason = reason[:255]
		template_map.approved_at = None
		template_map.approved_by = None
		template_map.updated_by = request.user
		template_map.save(
			update_fields=[
				"approval_status",
				"rejected_at",
				"rejected_by",
				"rejection_reason",
				"approved_at",
				"approved_by",
				"updated_by",
				"updated_at",
			]
		)
		return Response(_serialize_whatsapp_template_map(template_map), status=status.HTTP_200_OK)


class WhatsAppTemplateMapAuditCsvExportView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		status_filter = str(request.query_params.get("approval_status") or "").strip().lower()
		queryset = WhatsAppTemplateMap.objects.select_related(
			"submitted_by",
			"approved_by",
			"rejected_by",
		).order_by("notification_type")

		if status_filter in {
			WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT,
			WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED,
			WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
			WhatsAppTemplateMap.APPROVAL_STATUS_REJECTED,
		}:
			queryset = queryset.filter(approval_status=status_filter)

		buffer = io.StringIO()
		writer = csv.writer(buffer)
		writer.writerow(
			[
				"id",
				"notification_type",
				"template_name",
				"language_code",
				"category",
				"is_active",
				"approval_status",
				"submitted_at",
				"submitted_by_username",
				"approved_at",
				"approved_by_username",
				"rejected_at",
				"rejected_by_username",
				"rejection_reason",
				"updated_at",
			]
		)

		for item in queryset:
			writer.writerow(
				[
					item.id,
					item.notification_type,
					item.template_name,
					item.language_code,
					item.category,
					"true" if item.is_active else "false",
					item.approval_status,
					item.submitted_at.isoformat() if item.submitted_at else "",
					item.submitted_by.username if item.submitted_by else "",
					item.approved_at.isoformat() if item.approved_at else "",
					item.approved_by.username if item.approved_by else "",
					item.rejected_at.isoformat() if item.rejected_at else "",
					item.rejected_by.username if item.rejected_by else "",
					item.rejection_reason,
					item.updated_at.isoformat() if item.updated_at else "",
				]
			)

		filename_suffix = status_filter if status_filter in {
			WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT,
			WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED,
			WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
			WhatsAppTemplateMap.APPROVAL_STATUS_REJECTED,
		} else "all"

		response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
		response["Content-Disposition"] = f'attachment; filename="whatsapp_template_approvals_{filename_suffix}.csv"'
		return response


class WhatsAppHealthView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		hours_raw = str(request.query_params.get("hours") or "24").strip()
		try:
			hours = max(1, int(hours_raw))
		except ValueError:
			hours = 24

		since = timezone.now() - timedelta(hours=hours)
		qs = WhatsAppDelivery.objects.filter(created_at__gte=since)
		total = qs.count()
		sent = qs.filter(status=WhatsAppDelivery.STATUS_SENT).count()
		delivered = qs.filter(status=WhatsAppDelivery.STATUS_DELIVERED).count()
		read = qs.filter(status=WhatsAppDelivery.STATUS_READ).count()
		failed = qs.filter(status=WhatsAppDelivery.STATUS_FAILED).count()
		suppressed = qs.filter(status=WhatsAppDelivery.STATUS_SUPPRESSED).count()

		success = sent + delivered + read
		attempts = success + failed
		success_rate = (success / attempts) * 100 if attempts else 100.0
		top_errors = list(
			qs.filter(status=WhatsAppDelivery.STATUS_FAILED)
			.values("error_code")
			.annotate(total=Count("id"))
			.order_by("-total")[:5]
		)
		institution_breakdown = list(
			qs.values("institution_id", "institution__name")
			.annotate(
				total=Count("id"),
				sent=Count("id", filter=models.Q(status=WhatsAppDelivery.STATUS_SENT)),
				delivered=Count("id", filter=models.Q(status=WhatsAppDelivery.STATUS_DELIVERED)),
				read=Count("id", filter=models.Q(status=WhatsAppDelivery.STATUS_READ)),
				failed=Count("id", filter=models.Q(status=WhatsAppDelivery.STATUS_FAILED)),
				suppressed=Count("id", filter=models.Q(status=WhatsAppDelivery.STATUS_SUPPRESSED)),
			)
			.order_by("institution__name")
		)
		recent_metrics = list(
			WhatsAppInstitutionMetric.objects.select_related("institution")
			.order_by("-window_end")[:20]
			.values(
				"institution_id",
				"institution__name",
				"window_start",
				"window_end",
				"total",
				"sent",
				"delivered",
				"read",
				"failed",
				"suppressed",
				"success_rate",
			)
		)

		return Response(
			{
				"window_hours": hours,
				"totals": {
					"total": total,
					"sent": sent,
					"delivered": delivered,
					"read": read,
					"failed": failed,
					"suppressed": suppressed,
				},
				"success_rate": round(success_rate, 2),
				"thresholds": {
					"max_failed": int(getattr(settings, "KAMPUS_WHATSAPP_ALERT_MAX_FAILED", 10)),
					"min_success_rate": float(getattr(settings, "KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE", 90.0)),
				},
				"breach": bool(
					failed > int(getattr(settings, "KAMPUS_WHATSAPP_ALERT_MAX_FAILED", 10))
					or success_rate < float(getattr(settings, "KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE", 90.0))
				),
				"top_error_codes": top_errors,
				"institution_breakdown": institution_breakdown,
				"recent_institution_metrics": recent_metrics,
			},
			status=status.HTTP_200_OK,
		)


class NotificationsBaselineView(APIView):
	permission_classes = [IsAdmin]

	def get(self, request, *args, **kwargs):
		hours_raw = str(request.query_params.get("hours") or "24").strip()
		types_days_raw = str(request.query_params.get("types_days") or "30").strip()

		try:
			hours = max(1, int(hours_raw))
		except ValueError:
			hours = 24

		try:
			types_days = max(1, int(types_days_raw))
		except ValueError:
			types_days = 30

		payload = build_notifications_baseline_snapshot(hours=hours, types_days=types_days)
		return Response(payload, status=status.HTTP_200_OK)


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


def _extract_whatsapp_status_events(payload: dict) -> list[dict]:
	events: list[dict] = []
	entries = payload.get("entry") if isinstance(payload.get("entry"), list) else []
	for entry in entries:
		changes = entry.get("changes") if isinstance(entry, dict) and isinstance(entry.get("changes"), list) else []
		for change in changes:
			value = change.get("value") if isinstance(change, dict) and isinstance(change.get("value"), dict) else {}
			statuses = value.get("statuses") if isinstance(value.get("statuses"), list) else []
			for status_item in statuses:
				if not isinstance(status_item, dict):
					continue
				errors = status_item.get("errors") if isinstance(status_item.get("errors"), list) else []
				first_error = errors[0] if errors and isinstance(errors[0], dict) else {}
				events.append(
					{
						"provider_event_id": str(status_item.get("id") or "").strip() + ":" + str(status_item.get("status") or "").strip(),
						"event_type": str(status_item.get("status") or "").strip().lower() or "unknown",
						"provider_message_id": str(status_item.get("id") or "").strip(),
						"recipient_phone": str(status_item.get("recipient_id") or "").strip(),
						"error_code": str(first_error.get("code") or "").strip(),
						"error_message": str(first_error.get("title") or first_error.get("message") or "").strip(),
						"payload": status_item,
					}
				)
	return events


def _update_whatsapp_delivery_status(*, event_type: str, provider_message_id: str, error_code: str, error_message: str) -> None:
	if not provider_message_id:
		return

	delivery = WhatsAppDelivery.objects.filter(provider_message_id=provider_message_id).first()
	if delivery is None:
		return

	if event_type == "sent":
		delivery.status = WhatsAppDelivery.STATUS_SENT
		delivery.skip_reason = ""
		delivery.error_code = ""
		delivery.error_message = ""
		delivery.save(update_fields=["status", "skip_reason", "error_code", "error_message", "updated_at"])
		return

	if event_type == "delivered":
		delivery.status = WhatsAppDelivery.STATUS_DELIVERED
		delivery.skip_reason = ""
		delivery.error_code = ""
		delivery.error_message = ""
		delivery.save(update_fields=["status", "skip_reason", "error_code", "error_message", "updated_at"])
		return

	if event_type == "read":
		delivery.status = WhatsAppDelivery.STATUS_READ
		delivery.skip_reason = ""
		delivery.error_code = ""
		delivery.error_message = ""
		delivery.save(update_fields=["status", "skip_reason", "error_code", "error_message", "updated_at"])
		return

	if event_type == "failed":
		delivery.status = WhatsAppDelivery.STATUS_FAILED
		delivery.skip_reason = ""
		delivery.error_code = error_code
		delivery.error_message = error_message or "WhatsApp provider failure"
		delivery.save(update_fields=["status", "skip_reason", "error_code", "error_message", "updated_at"])


def _upsert_whatsapp_suppression(*, event_type: str, recipient_phone: str, provider_event_id: str, error_code: str) -> None:
	phone = str(recipient_phone or "").strip()
	if not phone:
		return

	if event_type != "failed":
		return

	if classify_whatsapp_error(error_code) != "PERMANENT":
		return

	reason = ""
	if error_code in {"131030"}:
		reason = WhatsAppSuppression.REASON_NOT_WHATSAPP
	elif error_code in {"131026", "131047", "100"}:
		reason = WhatsAppSuppression.REASON_POLICY_BLOCK
	elif error_code in {"131009", "131051"}:
		reason = WhatsAppSuppression.REASON_INVALID_NUMBER

	if not reason:
		return

	WhatsAppSuppression.objects.update_or_create(
		phone_number=phone,
		defaults={
			"reason": reason,
			"provider": "meta_cloud_api",
			"source_event_id": provider_event_id,
		},
	)


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


@method_decorator(csrf_exempt, name="dispatch")
class WhatsAppMetaWebhookView(APIView):
	permission_classes = [AllowAny]
	authentication_classes = []

	def get(self, request, *args, **kwargs):
		effective = get_effective_whatsapp_settings()
		mode = str(request.query_params.get("hub.mode") or "").strip()
		verify_token = str(request.query_params.get("hub.verify_token") or "").strip()
		challenge = str(request.query_params.get("hub.challenge") or "").strip()
		expected_token = str(effective.webhook_verify_token or "").strip()

		if mode == "subscribe" and challenge and expected_token and verify_token == expected_token:
			return HttpResponse(challenge, content_type="text/plain", status=status.HTTP_200_OK)
		return Response({"detail": "Webhook verification failed."}, status=status.HTTP_403_FORBIDDEN)

	def post(self, request, *args, **kwargs):
		raw_body = request._request.body
		if not _is_valid_whatsapp_signature(request, raw_body):
			return Response({"detail": "Invalid WhatsApp signature."}, status=status.HTTP_400_BAD_REQUEST)
		payload = request.data if isinstance(request.data, dict) else {}

		status_events = _extract_whatsapp_status_events(payload)
		for event in status_events:
			provider_event_id = event["provider_event_id"]
			if provider_event_id and WhatsAppEvent.objects.filter(provider="meta_cloud_api", provider_event_id=provider_event_id).exists():
				continue

			WhatsAppEvent.objects.create(
				provider="meta_cloud_api",
				provider_event_id=provider_event_id,
				event_type=event["event_type"],
				recipient_phone=event["recipient_phone"],
				provider_message_id=event["provider_message_id"],
				payload=event["payload"],
			)

			_update_whatsapp_delivery_status(
				event_type=event["event_type"],
				provider_message_id=event["provider_message_id"],
				error_code=event["error_code"],
				error_message=event["error_message"],
			)
			_upsert_whatsapp_suppression(
				event_type=event["event_type"],
				recipient_phone=event["recipient_phone"],
				provider_event_id=provider_event_id,
				error_code=event["error_code"],
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
		whatsapp_contact = WhatsAppContact.objects.filter(user=user, is_active=True).first()
		return Response(
			{
				"email": preference.email,
				"marketing_opt_in": preference.marketing_opt_in,
				"updated_at": preference.updated_at,
				"whatsapp": _serialize_whatsapp_contact(whatsapp_contact),
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
		whatsapp_contact = WhatsAppContact.objects.filter(user=user, is_active=True).first()
		return Response(
			{
				"email": preference.email,
				"marketing_opt_in": preference.marketing_opt_in,
				"updated_at": preference.updated_at,
				"whatsapp": _serialize_whatsapp_contact(whatsapp_contact),
			}
		)


class WhatsAppContactMeView(APIView):
	permission_classes = [IsAuthenticated]

	def get(self, request, *args, **kwargs):
		contact = WhatsAppContact.objects.filter(user=request.user, is_active=True).first()
		return Response(_serialize_whatsapp_contact(contact), status=status.HTTP_200_OK)

	def put(self, request, *args, **kwargs):
		payload = request.data if isinstance(request.data, dict) else {}
		normalized_phone = _normalize_whatsapp_phone(payload.get("phone_number") or "")
		if not normalized_phone:
			return Response(
				{"detail": "phone_number inválido. Usa formato E.164 (ej: +573001234567)."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		existing = WhatsAppContact.objects.filter(phone_number=normalized_phone).exclude(user=request.user).first()
		if existing is not None:
			return Response({"detail": "El número ya está asociado a otro usuario."}, status=status.HTTP_400_BAD_REQUEST)

		contact, _ = WhatsAppContact.objects.update_or_create(
			user=request.user,
			defaults={
				"phone_number": normalized_phone,
				"is_active": True,
			},
		)
		return Response(_serialize_whatsapp_contact(contact), status=status.HTTP_200_OK)

	def delete(self, request, *args, **kwargs):
		contact = WhatsAppContact.objects.filter(user=request.user, is_active=True).first()
		if contact is None:
			return Response({"detail": "No hay contacto WhatsApp activo."}, status=status.HTTP_404_NOT_FOUND)

		contact.is_active = False
		contact.save(update_fields=["is_active", "updated_at"])
		return Response({"detail": "Contacto WhatsApp desactivado."}, status=status.HTTP_200_OK)


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
