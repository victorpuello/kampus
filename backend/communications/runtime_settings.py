from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError

from .models import MailgunSettings, WhatsAppSettings


@dataclass
class EffectiveMailSettings:
    environment: str
    kampus_email_backend: str
    email_backend: str
    default_from_email: str
    server_email: str
    mailgun_api_key: str
    mailgun_sender_domain: str
    mailgun_api_url: str
    mailgun_webhook_signing_key: str
    mailgun_webhook_strict: bool


@dataclass
class EffectiveWhatsAppSettings:
    environment: str
    enabled: bool
    provider: str
    graph_base_url: str
    api_version: str
    phone_number_id: str
    access_token: str
    app_secret: str
    webhook_verify_token: str
    webhook_strict: bool
    http_timeout_seconds: int
    send_mode: str
    template_fallback_name: str
    template_sla_warning_pending_hours: int
    template_sla_critical_pending_hours: int
    template_sla_warning_approval_hours: int
    template_sla_critical_approval_hours: int


def _safe_env_bool(value: object, *, fallback: bool = False) -> bool:
    if value is None:
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes"}


def _resolve_environment(environment: str | None = None) -> str:
    requested = str(environment or "").strip().lower()
    if requested in {MailgunSettings.ENV_DEVELOPMENT, MailgunSettings.ENV_PRODUCTION}:
        return requested

    configured = str(getattr(settings, "KAMPUS_MAIL_SETTINGS_ENV", "") or "").strip().lower()
    if configured in {MailgunSettings.ENV_DEVELOPMENT, MailgunSettings.ENV_PRODUCTION}:
        return configured

    is_production = bool(getattr(settings, "IS_PRODUCTION", False))
    return MailgunSettings.ENV_PRODUCTION if is_production else MailgunSettings.ENV_DEVELOPMENT


def _build_from_env(*, environment: str | None = None) -> EffectiveMailSettings:
    resolved_environment = _resolve_environment(environment)
    kampus_email_backend = str(getattr(settings, "KAMPUS_EMAIL_BACKEND", "console") or "console").strip().lower()
    if kampus_email_backend not in {"console", "mailgun"}:
        kampus_email_backend = "console"

    configured_backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip()
    if configured_backend:
        email_backend = configured_backend
    else:
        email_backend = "django.core.mail.backends.console.EmailBackend"
        if kampus_email_backend == "mailgun":
            email_backend = "anymail.backends.mailgun.EmailBackend"

    if "mailgun" in email_backend.lower():
        kampus_email_backend = "mailgun"

    anymail = getattr(settings, "ANYMAIL", {}) if isinstance(getattr(settings, "ANYMAIL", {}), dict) else {}

    return EffectiveMailSettings(
        environment=resolved_environment,
        kampus_email_backend=kampus_email_backend,
        email_backend=email_backend,
        default_from_email=str(getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@localhost") or "no-reply@localhost").strip(),
        server_email=str(getattr(settings, "SERVER_EMAIL", "no-reply@localhost") or "no-reply@localhost").strip(),
        mailgun_api_key=str(anymail.get("MAILGUN_API_KEY") or "").strip(),
        mailgun_sender_domain=str(anymail.get("MAILGUN_SENDER_DOMAIN") or "").strip(),
        mailgun_api_url=str(getattr(settings, "MAILGUN_API_URL", "") or "").strip(),
        mailgun_webhook_signing_key=str(getattr(settings, "MAILGUN_WEBHOOK_SIGNING_KEY", "") or "").strip(),
        mailgun_webhook_strict=_safe_env_bool(getattr(settings, "MAILGUN_WEBHOOK_STRICT", False), fallback=False),
    )


def get_effective_mail_settings(environment: str | None = None) -> EffectiveMailSettings:
    resolved_environment = _resolve_environment(environment)
    try:
        config = MailgunSettings.objects.filter(environment=resolved_environment).order_by("-updated_at").first()
    except (OperationalError, ProgrammingError):
        config = None

    if config is None:
        return _build_from_env(environment=resolved_environment)

    kampus_email_backend = str(config.kampus_email_backend or "console").strip().lower()
    if kampus_email_backend not in {"console", "mailgun"}:
        kampus_email_backend = "console"

    email_backend = "django.core.mail.backends.console.EmailBackend"
    if kampus_email_backend == "mailgun":
        email_backend = "anymail.backends.mailgun.EmailBackend"

    return EffectiveMailSettings(
        environment=str(config.environment or resolved_environment).strip().lower() or resolved_environment,
        kampus_email_backend=kampus_email_backend,
        email_backend=email_backend,
        default_from_email=str(config.default_from_email or "no-reply@localhost").strip(),
        server_email=str(config.server_email or config.default_from_email or "no-reply@localhost").strip(),
        mailgun_api_key=str(config.mailgun_api_key or "").strip(),
        mailgun_sender_domain=str(config.mailgun_sender_domain or "").strip(),
        mailgun_api_url=str(config.mailgun_api_url or "").strip(),
        mailgun_webhook_signing_key=str(config.mailgun_webhook_signing_key or "").strip(),
        mailgun_webhook_strict=bool(config.mailgun_webhook_strict),
    )


def apply_effective_mail_settings(environment: str | None = None) -> EffectiveMailSettings:
    effective = get_effective_mail_settings(environment=environment)

    settings.KAMPUS_EMAIL_BACKEND = effective.kampus_email_backend
    settings.EMAIL_BACKEND = effective.email_backend
    settings.DEFAULT_FROM_EMAIL = effective.default_from_email
    settings.SERVER_EMAIL = effective.server_email

    anymail = {
        "MAILGUN_API_KEY": effective.mailgun_api_key,
        "MAILGUN_SENDER_DOMAIN": effective.mailgun_sender_domain,
    }
    if effective.mailgun_api_url:
        anymail["MAILGUN_API_URL"] = effective.mailgun_api_url
    settings.ANYMAIL = anymail

    settings.MAILGUN_API_URL = effective.mailgun_api_url
    settings.MAILGUN_WEBHOOK_SIGNING_KEY = effective.mailgun_webhook_signing_key
    settings.MAILGUN_WEBHOOK_STRICT = effective.mailgun_webhook_strict
    return effective


def _build_whatsapp_from_env(*, environment: str | None = None) -> EffectiveWhatsAppSettings:
    resolved_environment = _resolve_environment(environment)
    return EffectiveWhatsAppSettings(
        environment=resolved_environment,
        enabled=_safe_env_bool(getattr(settings, "KAMPUS_WHATSAPP_ENABLED", False), fallback=False),
        provider=str(getattr(settings, "KAMPUS_WHATSAPP_PROVIDER", "meta_cloud_api") or "meta_cloud_api").strip().lower(),
        graph_base_url=str(getattr(settings, "KAMPUS_WHATSAPP_GRAPH_BASE_URL", "https://graph.facebook.com") or "https://graph.facebook.com").strip().rstrip("/"),
        api_version=str(getattr(settings, "KAMPUS_WHATSAPP_API_VERSION", "v21.0") or "v21.0").strip(),
        phone_number_id=str(getattr(settings, "KAMPUS_WHATSAPP_PHONE_NUMBER_ID", "") or "").strip(),
        access_token=str(getattr(settings, "KAMPUS_WHATSAPP_ACCESS_TOKEN", "") or "").strip(),
        app_secret=str(getattr(settings, "KAMPUS_WHATSAPP_APP_SECRET", "") or "").strip(),
        webhook_verify_token=str(getattr(settings, "KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN", "") or "").strip(),
        webhook_strict=_safe_env_bool(getattr(settings, "KAMPUS_WHATSAPP_WEBHOOK_STRICT", True), fallback=True),
        http_timeout_seconds=int(getattr(settings, "KAMPUS_WHATSAPP_HTTP_TIMEOUT_SECONDS", 12) or 12),
        send_mode=str(getattr(settings, "KAMPUS_WHATSAPP_SEND_MODE", "template") or "template").strip().lower(),
        template_fallback_name=str(getattr(settings, "KAMPUS_WHATSAPP_TEMPLATE_FALLBACK_NAME", "") or "").strip(),
        template_sla_warning_pending_hours=int(getattr(settings, "KAMPUS_WHATSAPP_TEMPLATE_SLA_WARNING_PENDING_HOURS", 24) or 24),
        template_sla_critical_pending_hours=int(getattr(settings, "KAMPUS_WHATSAPP_TEMPLATE_SLA_CRITICAL_PENDING_HOURS", 72) or 72),
        template_sla_warning_approval_hours=int(getattr(settings, "KAMPUS_WHATSAPP_TEMPLATE_SLA_WARNING_APPROVAL_HOURS", 24) or 24),
        template_sla_critical_approval_hours=int(getattr(settings, "KAMPUS_WHATSAPP_TEMPLATE_SLA_CRITICAL_APPROVAL_HOURS", 72) or 72),
    )


def get_effective_whatsapp_settings(environment: str | None = None) -> EffectiveWhatsAppSettings:
    resolved_environment = _resolve_environment(environment)
    try:
        config = WhatsAppSettings.objects.filter(environment=resolved_environment).order_by("-updated_at").first()
    except (OperationalError, ProgrammingError):
        config = None

    if config is None:
        return _build_whatsapp_from_env(environment=resolved_environment)

    return EffectiveWhatsAppSettings(
        environment=str(config.environment or resolved_environment).strip().lower() or resolved_environment,
        enabled=bool(config.enabled),
        provider=str(config.provider or "meta_cloud_api").strip().lower(),
        graph_base_url=str(config.graph_base_url or "https://graph.facebook.com").strip().rstrip("/"),
        api_version=str(config.api_version or "v21.0").strip(),
        phone_number_id=str(config.phone_number_id or "").strip(),
        access_token=str(config.access_token or "").strip(),
        app_secret=str(config.app_secret or "").strip(),
        webhook_verify_token=str(config.webhook_verify_token or "").strip(),
        webhook_strict=bool(config.webhook_strict),
        http_timeout_seconds=int(config.http_timeout_seconds or 12),
        send_mode=str(config.send_mode or "template").strip().lower(),
        template_fallback_name=str(config.template_fallback_name or "").strip(),
        template_sla_warning_pending_hours=int(config.template_sla_warning_pending_hours or 24),
        template_sla_critical_pending_hours=int(config.template_sla_critical_pending_hours or 72),
        template_sla_warning_approval_hours=int(config.template_sla_warning_approval_hours or 24),
        template_sla_critical_approval_hours=int(config.template_sla_critical_approval_hours or 72),
    )


def apply_effective_whatsapp_settings(environment: str | None = None) -> EffectiveWhatsAppSettings:
    effective = get_effective_whatsapp_settings(environment=environment)

    settings.KAMPUS_WHATSAPP_ENABLED = effective.enabled
    settings.KAMPUS_WHATSAPP_PROVIDER = effective.provider
    settings.KAMPUS_WHATSAPP_GRAPH_BASE_URL = effective.graph_base_url
    settings.KAMPUS_WHATSAPP_API_VERSION = effective.api_version
    settings.KAMPUS_WHATSAPP_PHONE_NUMBER_ID = effective.phone_number_id
    settings.KAMPUS_WHATSAPP_ACCESS_TOKEN = effective.access_token
    settings.KAMPUS_WHATSAPP_APP_SECRET = effective.app_secret
    settings.KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN = effective.webhook_verify_token
    settings.KAMPUS_WHATSAPP_WEBHOOK_STRICT = effective.webhook_strict
    settings.KAMPUS_WHATSAPP_HTTP_TIMEOUT_SECONDS = effective.http_timeout_seconds
    settings.KAMPUS_WHATSAPP_SEND_MODE = effective.send_mode
    settings.KAMPUS_WHATSAPP_TEMPLATE_FALLBACK_NAME = effective.template_fallback_name
    settings.KAMPUS_WHATSAPP_TEMPLATE_SLA_WARNING_PENDING_HOURS = effective.template_sla_warning_pending_hours
    settings.KAMPUS_WHATSAPP_TEMPLATE_SLA_CRITICAL_PENDING_HOURS = effective.template_sla_critical_pending_hours
    settings.KAMPUS_WHATSAPP_TEMPLATE_SLA_WARNING_APPROVAL_HOURS = effective.template_sla_warning_approval_hours
    settings.KAMPUS_WHATSAPP_TEMPLATE_SLA_CRITICAL_APPROVAL_HOURS = effective.template_sla_critical_approval_hours
    return effective
