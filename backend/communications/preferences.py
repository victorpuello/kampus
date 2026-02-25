from __future__ import annotations

from django.conf import settings
from django.core import signing

from .models import EmailPreference, EmailPreferenceAudit


TOKEN_SALT = "communications.marketing.unsubscribe"


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def is_marketing_category(category: str) -> bool:
    normalized = str(category or "").strip().lower()
    return normalized.startswith("marketing")


def get_or_create_preference(*, email: str, user=None) -> EmailPreference:
    normalized_email = normalize_email(email)
    preference, created = EmailPreference.objects.get_or_create(
        email=normalized_email,
        defaults={
            "user": user,
            "marketing_opt_in": bool(getattr(settings, "MARKETING_DEFAULT_OPT_IN", False)),
        },
    )
    if user is not None and preference.user_id != getattr(user, "id", None):
        preference.user = user
        preference.save(update_fields=["user", "updated_at"])
    return preference


def set_marketing_preference(*, preference: EmailPreference, opt_in: bool, source: str, notes: str = "") -> EmailPreference:
    previous = bool(preference.marketing_opt_in)
    new_value = bool(opt_in)
    if previous == new_value:
        return preference

    preference.marketing_opt_in = new_value
    preference.save(update_fields=["marketing_opt_in", "updated_at"])

    EmailPreferenceAudit.objects.create(
        preference=preference,
        previous_marketing_opt_in=previous,
        new_marketing_opt_in=new_value,
        source=source,
        notes=notes,
    )
    return preference


def build_unsubscribe_token(*, email: str) -> str:
    signer = signing.TimestampSigner(salt=TOKEN_SALT)
    return signer.sign(normalize_email(email))


def validate_unsubscribe_token(token: str) -> str:
    signer = signing.TimestampSigner(salt=TOKEN_SALT)
    max_age = max(60, int(getattr(settings, "MARKETING_UNSUBSCRIBE_TOKEN_TTL_SECONDS", 2592000)))
    email = signer.unsign(str(token or ""), max_age=max_age)
    return normalize_email(email)


def build_unsubscribe_url(*, email: str) -> str:
    backend_base = str(getattr(settings, "KAMPUS_BACKEND_BASE_URL", "") or "").strip().rstrip("/")
    if not backend_base:
        return ""
    token = build_unsubscribe_token(email=email)
    return f"{backend_base}/api/communications/unsubscribe/one-click/?token={token}"
