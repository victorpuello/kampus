from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError

from .models import MailgunSettings


@dataclass
class EffectiveMailSettings:
    kampus_email_backend: str
    email_backend: str
    default_from_email: str
    server_email: str
    mailgun_api_key: str
    mailgun_sender_domain: str
    mailgun_api_url: str
    mailgun_webhook_signing_key: str
    mailgun_webhook_strict: bool


def _safe_env_bool(value: object, *, fallback: bool = False) -> bool:
    if value is None:
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes"}


def _build_from_env() -> EffectiveMailSettings:
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


def get_effective_mail_settings() -> EffectiveMailSettings:
    try:
        config = MailgunSettings.objects.order_by("-updated_at").first()
    except (OperationalError, ProgrammingError):
        config = None

    if config is None:
        return _build_from_env()

    kampus_email_backend = str(config.kampus_email_backend or "console").strip().lower()
    if kampus_email_backend not in {"console", "mailgun"}:
        kampus_email_backend = "console"

    email_backend = "django.core.mail.backends.console.EmailBackend"
    if kampus_email_backend == "mailgun":
        email_backend = "anymail.backends.mailgun.EmailBackend"

    return EffectiveMailSettings(
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


def apply_effective_mail_settings() -> EffectiveMailSettings:
    effective = get_effective_mail_settings()

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
