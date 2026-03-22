"""
Django settings for kampus_backend project.

Base de configuración alineada con las reglas del proyecto Kampus:
- DRF + JWT (SimpleJWT)
- CORS Headers
- PostgreSQL vía variables de entorno con fallback a SQLite en desarrollo
- Modelo de usuario personalizado en `users.User`
"""

from pathlib import Path
import os
from urllib.parse import urlparse
from celery.schedules import crontab
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
DJANGO_ENV = (os.getenv("DJANGO_ENV") or "development").strip().lower()
IS_PRODUCTION = DJANGO_ENV == "production"


# Discipline / Observador settings
DISCIPLINE_DESCARGOS_DUE_DAYS = int(os.getenv("DISCIPLINE_DESCARGOS_DUE_DAYS", "3"))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = (os.getenv("DJANGO_SECRET_KEY") or "").strip()
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DJANGO_ENV=production")
    SECRET_KEY = "django-insecure-dev-only-change-before-shared-environments"
if IS_PRODUCTION and (SECRET_KEY.startswith("django-insecure") or len(SECRET_KEY) < 32):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY is too weak for production")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv("DJANGO_DEBUG", "false" if IS_PRODUCTION else "true").lower() == "true"
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG must be false when DJANGO_ENV=production")

# Upload limits
#
# Large system backups (db fixtures or full bundles) can easily be hundreds of MB.
# Django raises RequestDataTooBig (a SuspiciousOperation) when request bodies exceed
# DATA_UPLOAD_MAX_MEMORY_SIZE, which may surface as a 500 depending on DEBUG/server.
# Make this configurable and default to a safe value for local/dev.
KAMPUS_MAX_UPLOAD_MB = int(os.getenv("KAMPUS_MAX_UPLOAD_MB", "1024"))
DATA_UPLOAD_MAX_MEMORY_SIZE = KAMPUS_MAX_UPLOAD_MB * 1024 * 1024

# Threshold for keeping uploaded files in-memory before streaming to a temp file.
# This is NOT a max upload size.
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("KAMPUS_FILE_UPLOAD_IN_MEMORY_MB", "10")) * 1024 * 1024

ALLOWED_HOSTS = (
    os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")
    if os.getenv("DJANGO_ALLOWED_HOSTS")
    else (["*"] if DEBUG else [])
)
if IS_PRODUCTION and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS is required when DJANGO_ENV=production")

# Public-facing base URL used for QR verification links.
# Example: https://colegio.midominio.com
# If not set, we fall back to request.build_absolute_uri(), which depends on
# correct reverse-proxy headers.
def _clean_env_url(name: str) -> str:
    return (os.getenv(name) or "").strip().rstrip("/")


def _validate_public_base_url(name: str, value: str, *, required_in_production: bool) -> str:
    clean = str(value or "").strip().rstrip("/")
    if not clean:
        if required_in_production and IS_PRODUCTION:
            raise ImproperlyConfigured(f"{name} is required when DJANGO_ENV=production")
        return ""

    parsed = urlparse(clean)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ImproperlyConfigured(f"{name} must be an absolute http(s) URL")

    if parsed.params or parsed.query or parsed.fragment:
        raise ImproperlyConfigured(f"{name} must not include params, query strings, or fragments")

    normalized_path = (parsed.path or "").rstrip("/")
    if normalized_path:
        raise ImproperlyConfigured(f"{name} must be a base origin without a path")

    hostname = (parsed.hostname or "").strip().lower()
    if IS_PRODUCTION and hostname in {"localhost", "127.0.0.1", "0.0.0.0"}:
        raise ImproperlyConfigured(f"{name} cannot point to localhost when DJANGO_ENV=production")

    return clean


PUBLIC_SITE_URL = _validate_public_base_url(
    "KAMPUS_PUBLIC_SITE_URL",
    _clean_env_url("KAMPUS_PUBLIC_SITE_URL"),
    required_in_production=True,
)

# Public verification throttling (DRF). Example values: "60/min", "100/hour".
PUBLIC_VERIFY_THROTTLE_RATE = (os.getenv("KAMPUS_PUBLIC_VERIFY_THROTTLE_RATE") or "60/min").strip()
AUTH_LOGIN_IP_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_LOGIN_IP_THROTTLE_RATE") or "20/min").strip()
AUTH_LOGIN_USER_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_LOGIN_USER_THROTTLE_RATE") or "10/min").strip()
AUTH_REFRESH_IP_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_REFRESH_IP_THROTTLE_RATE") or "60/min").strip()
AUTH_PASSWORD_RESET_REQUEST_IP_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_PASSWORD_RESET_REQUEST_IP_THROTTLE_RATE") or "10/min").strip()
AUTH_PASSWORD_RESET_REQUEST_EMAIL_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_PASSWORD_RESET_REQUEST_EMAIL_THROTTLE_RATE") or "5/hour").strip()
AUTH_PASSWORD_RESET_CONFIRM_IP_THROTTLE_RATE = (os.getenv("KAMPUS_AUTH_PASSWORD_RESET_CONFIRM_IP_THROTTLE_RATE") or "20/min").strip()
ACADEMIC_AI_USER_THROTTLE_RATE = (os.getenv("KAMPUS_ACADEMIC_AI_USER_THROTTLE_RATE") or "5/min").strip()

PASSWORD_RESET_TOKEN_TTL_SECONDS = int(os.getenv("KAMPUS_PASSWORD_RESET_TOKEN_TTL_SECONDS", "3600"))
KAMPUS_FRONTEND_BASE_URL = (
    _clean_env_url("KAMPUS_FRONTEND_BASE_URL")
    or PUBLIC_SITE_URL
    or "http://localhost:5173"
).strip().rstrip("/")
KAMPUS_FRONTEND_BASE_URL = _validate_public_base_url(
    "KAMPUS_FRONTEND_BASE_URL",
    KAMPUS_FRONTEND_BASE_URL,
    required_in_production=True,
)
NOTIFICATIONS_EMAIL_ENABLED = (os.getenv("KAMPUS_NOTIFICATIONS_EMAIL_ENABLED") or "true").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOTIFICATIONS_OUTBOX_ONLY = (os.getenv("KAMPUS_NOTIFICATIONS_OUTBOX_ONLY") or "false").strip().lower() in {"1", "true", "yes"}

# Auth cookie settings (JWT in HttpOnly cookies)
AUTH_COOKIE_ACCESS_NAME = os.getenv("KAMPUS_AUTH_COOKIE_ACCESS_NAME", "kampus_access")
AUTH_COOKIE_REFRESH_NAME = os.getenv("KAMPUS_AUTH_COOKIE_REFRESH_NAME", "kampus_refresh")
AUTH_COOKIE_PATH = os.getenv("KAMPUS_AUTH_COOKIE_PATH", "/")
AUTH_COOKIE_DOMAIN = (os.getenv("KAMPUS_AUTH_COOKIE_DOMAIN") or "").strip() or None
AUTH_COOKIE_SAMESITE = os.getenv("KAMPUS_AUTH_COOKIE_SAMESITE", "Lax")
AUTH_COOKIE_SECURE = os.getenv("KAMPUS_AUTH_COOKIE_SECURE", "false" if DEBUG else "true").lower() in {"1", "true", "yes"}

# Security hardening (production defaults can be overridden by env vars).
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "true" if IS_PRODUCTION else "false").lower() in {"1", "true", "yes"}
SESSION_COOKIE_SECURE = os.getenv("DJANGO_SESSION_COOKIE_SECURE", "true" if IS_PRODUCTION else "false").lower() in {"1", "true", "yes"}
CSRF_COOKIE_SECURE = os.getenv("DJANGO_CSRF_COOKIE_SECURE", "true" if IS_PRODUCTION else "false").lower() in {"1", "true", "yes"}
SECURE_CONTENT_TYPE_NOSNIFF = os.getenv("DJANGO_SECURE_CONTENT_TYPE_NOSNIFF", "true").lower() in {"1", "true", "yes"}
X_FRAME_OPTIONS = os.getenv("DJANGO_X_FRAME_OPTIONS", "DENY")
SECURE_REFERRER_POLICY = os.getenv("DJANGO_SECURE_REFERRER_POLICY", "strict-origin-when-cross-origin")
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000" if IS_PRODUCTION else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", "true" if IS_PRODUCTION else "false").lower() in {"1", "true", "yes"}
SECURE_HSTS_PRELOAD = os.getenv("DJANGO_SECURE_HSTS_PRELOAD", "true" if IS_PRODUCTION else "false").lower() in {"1", "true", "yes"}

# Elections hardening toggles
ELECTIONS_REQUIRE_TOKEN_IDENTITY = os.getenv("KAMPUS_ELECTIONS_REQUIRE_TOKEN_IDENTITY", "false").lower() in {"1", "true", "yes"}

# Reverse-proxy support (recommended in production when TLS terminates at the proxy).
USE_X_FORWARDED_HOST = os.getenv("DJANGO_USE_X_FORWARDED_HOST", "false").lower() in {"1", "true", "yes"}
if os.getenv("DJANGO_SECURE_PROXY_SSL_HEADER", "false").lower() in {"1", "true", "yes"}:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


# Application definition

INSTALLED_APPS = [
    # Django core
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party
    "rest_framework",
    "corsheaders",
    "django_filters",
    "anymail",

    # Local apps
    "core",
    "users",
    "students.apps.StudentsConfig",
    "teachers",
    "academic",
    "communications",
    "discipline",
    "reports",
    "config",
    "notifications",
    "audit",
    "attendance",
    "verification",
    "novelties",
    "elections",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CORS debe ir lo más arriba posible después de SecurityMiddleware
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    # Normalize accidental whitespace in public verify URLs (e.g. copied from PDFs).
    "verification.middleware.NormalizeVerificationPathMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "kampus_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "kampus_backend.wsgi.application"


# Database
# PostgreSQL vía variables de entorno; fallback a SQLite para desarrollo local
if os.getenv("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB"),
            "USER": os.getenv("POSTGRES_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
            "HOST": os.getenv("POSTGRES_HOST", "localhost"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


LANGUAGE_CODE = "es-co"

TIME_ZONE = "America/Bogota"

USE_I18N = True

USE_TZ = True


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Archivos de medios
# Permite override por entorno (p.ej. contenedores con volumen dedicado).
_media_url_raw = (os.getenv("DJANGO_MEDIA_URL") or "/media/").strip()
MEDIA_URL = f"/{_media_url_raw.strip('/')}/" if _media_url_raw.strip("/") else "/media/"
MEDIA_ROOT = Path((os.getenv("DJANGO_MEDIA_ROOT") or str(BASE_DIR / "media")).strip())

# Storage privado (fuera de MEDIA)
#
# IMPORTANT: Los archivos en este storage NO deben exponerse por URL pública.
# La descarga se hará únicamente vía endpoints autenticados (FileResponse).
PRIVATE_STORAGE_ROOT = Path(
    os.getenv("KAMPUS_PRIVATE_STORAGE_ROOT", str(BASE_DIR / "private_storage"))
)
PRIVATE_REPORTS_DIR = os.getenv("KAMPUS_PRIVATE_REPORTS_DIR", "reports")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "kampus_backend.authentication.KampusJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    # Avoid clashes with our own endpoints that legitimately use ?format=...
    # (DRF defaults to using ?format=... as a renderer override and returns 404
    # for unknown formats like 'pdf' or 'html').
    "URL_FORMAT_OVERRIDE": None,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "public_verify": PUBLIC_VERIFY_THROTTLE_RATE,
        "auth_login_ip": AUTH_LOGIN_IP_THROTTLE_RATE,
        "auth_login_user": AUTH_LOGIN_USER_THROTTLE_RATE,
        "auth_refresh_ip": AUTH_REFRESH_IP_THROTTLE_RATE,
        "auth_password_reset_request_ip": AUTH_PASSWORD_RESET_REQUEST_IP_THROTTLE_RATE,
        "auth_password_reset_request_email": AUTH_PASSWORD_RESET_REQUEST_EMAIL_THROTTLE_RATE,
        "auth_password_reset_confirm_ip": AUTH_PASSWORD_RESET_CONFIRM_IP_THROTTLE_RATE,
        "academic_ai_user": ACADEMIC_AI_USER_THROTTLE_RATE,
    },
}

# CORS
CORS_ALLOWED_ORIGINS = [
    origin
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

if DEBUG:
    _default_local_frontend_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    for _origin in _default_local_frontend_origins:
        if _origin not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(_origin)
        if _origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(_origin)

if DEBUG and not CORS_ALLOWED_ORIGINS:
    CORS_ALLOW_ALL_ORIGINS = True

if DEBUG and not CSRF_TRUSTED_ORIGINS:
    if CORS_ALLOWED_ORIGINS:
        CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)
    else:
        CSRF_TRUSTED_ORIGINS = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

# Usuario personalizado
AUTH_USER_MODEL = "users.User"

# Google Gemini API Key
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Celery (async jobs)
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = os.getenv("CELERY_TASK_EAGER_PROPAGATES", "true").lower() == "true"

KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED = (os.getenv("KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED") or "true").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED = (os.getenv("KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_MINUTE = int(os.getenv("KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_MINUTE", "0"))
KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_HOUR = int(os.getenv("KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_HOUR", "8"))
KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_DAY_OF_WEEK") or "1-5").strip()
KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED = (os.getenv("KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOTIFICATIONS_HEALTH_BEAT_MINUTE = int(os.getenv("KAMPUS_NOTIFICATIONS_HEALTH_BEAT_MINUTE", "15"))
KAMPUS_NOTIFICATIONS_HEALTH_BEAT_HOUR = (os.getenv("KAMPUS_NOTIFICATIONS_HEALTH_BEAT_HOUR") or "*").strip()
KAMPUS_NOTIFICATIONS_HEALTH_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_NOTIFICATIONS_HEALTH_BEAT_DAY_OF_WEEK") or "1-5").strip()
KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED = (os.getenv("KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_WHATSAPP_HEALTH_BEAT_MINUTE = (os.getenv("KAMPUS_WHATSAPP_HEALTH_BEAT_MINUTE") or "30").strip()
KAMPUS_WHATSAPP_HEALTH_BEAT_HOUR = (os.getenv("KAMPUS_WHATSAPP_HEALTH_BEAT_HOUR") or "*").strip()
KAMPUS_WHATSAPP_HEALTH_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_WHATSAPP_HEALTH_BEAT_DAY_OF_WEEK") or "1-5").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_ENABLED = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_MINUTE = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_MINUTE") or "*/2").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_HOUR = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_HOUR") or "*").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_DAY_OF_WEEK") or "*").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BATCH_SIZE = int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BATCH_SIZE", "100"))
KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_MAX_RETRIES = int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_MAX_RETRIES", "5"))
KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_ENABLED = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_MINUTE = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_MINUTE") or "*/5").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_HOUR = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_HOUR") or "*").strip()
KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_DAY_OF_WEEK") or "*").strip()
KAMPUS_PLANNING_REMINDER_ENABLED = (os.getenv("KAMPUS_PLANNING_REMINDER_ENABLED") or "true").strip().lower() in {"1", "true", "yes"}
KAMPUS_PLANNING_REMINDER_BEAT_ENABLED = (os.getenv("KAMPUS_PLANNING_REMINDER_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_PLANNING_REMINDER_BEAT_MINUTE = int(os.getenv("KAMPUS_PLANNING_REMINDER_BEAT_MINUTE", "0"))
KAMPUS_PLANNING_REMINDER_BEAT_HOUR = int(os.getenv("KAMPUS_PLANNING_REMINDER_BEAT_HOUR", "7"))
KAMPUS_PLANNING_REMINDER_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_PLANNING_REMINDER_BEAT_DAY_OF_WEEK") or "1-5").strip()
KAMPUS_OPERATIONAL_PLAN_REMINDER_ENABLED = (os.getenv("KAMPUS_OPERATIONAL_PLAN_REMINDER_ENABLED") or "true").strip().lower() in {"1", "true", "yes"}
KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_ENABLED = (os.getenv("KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_MINUTE = int(os.getenv("KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_MINUTE", "0"))
KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_HOUR = int(os.getenv("KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_HOUR", "6"))
KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_DAY_OF_WEEK = (os.getenv("KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_DAY_OF_WEEK") or "1-5").strip()

CELERY_BEAT_SCHEDULE = {}
if KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED and KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["notify-novelties-sla"] = {
        "task": "novelties.notify_novelties_sla",
        "schedule": crontab(
            minute=KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_MINUTE,
            hour=KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_HOUR,
            day_of_week=KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_DAY_OF_WEEK,
        ),
    }
if KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["check-notifications-health"] = {
        "task": "notifications.check_notifications_health",
        "schedule": crontab(
            minute=KAMPUS_NOTIFICATIONS_HEALTH_BEAT_MINUTE,
            hour=KAMPUS_NOTIFICATIONS_HEALTH_BEAT_HOUR,
            day_of_week=KAMPUS_NOTIFICATIONS_HEALTH_BEAT_DAY_OF_WEEK,
        ),
    }
if KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["check-whatsapp-health"] = {
        "task": "notifications.check_whatsapp_health",
        "schedule": crontab(
            minute=KAMPUS_WHATSAPP_HEALTH_BEAT_MINUTE,
            hour=KAMPUS_WHATSAPP_HEALTH_BEAT_HOUR,
            day_of_week=KAMPUS_WHATSAPP_HEALTH_BEAT_DAY_OF_WEEK,
        ),
    }
if KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["process-notification-dispatch-outbox"] = {
        "task": "notifications.process_dispatch_outbox",
        "schedule": crontab(
            minute=KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_MINUTE,
            hour=KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_HOUR,
            day_of_week=KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_DAY_OF_WEEK,
        ),
        "args": [
            max(1, KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BATCH_SIZE),
            max(1, KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_MAX_RETRIES),
        ],
    }
if KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["check-notification-dispatch-outbox-health"] = {
        "task": "notifications.check_dispatch_outbox_health",
        "schedule": crontab(
            minute=KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_MINUTE,
            hour=KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_HOUR,
            day_of_week=KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_DAY_OF_WEEK,
        ),
    }
if KAMPUS_PLANNING_REMINDER_ENABLED and KAMPUS_PLANNING_REMINDER_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["notify-pending-planning-teachers"] = {
        "task": "teachers.notify_pending_planning_teachers",
        "schedule": crontab(
            minute=KAMPUS_PLANNING_REMINDER_BEAT_MINUTE,
            hour=KAMPUS_PLANNING_REMINDER_BEAT_HOUR,
            day_of_week=KAMPUS_PLANNING_REMINDER_BEAT_DAY_OF_WEEK,
        ),
    }
if KAMPUS_OPERATIONAL_PLAN_REMINDER_ENABLED and KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_ENABLED:
    CELERY_BEAT_SCHEDULE["notify-operational-plan-activities"] = {
        "task": "notifications.notify_operational_plan_activities",
        "schedule": crontab(
            minute=KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_MINUTE,
            hour=KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_HOUR,
            day_of_week=KAMPUS_OPERATIONAL_PLAN_REMINDER_BEAT_DAY_OF_WEEK,
        ),
    }

# Cache
#
# In Docker we provide KAMPUS_CACHE_URL (Redis). In local/dev without Redis, we
# fall back to LocMemCache.
KAMPUS_CACHE_URL = (os.getenv("KAMPUS_CACHE_URL") or "").strip()
KAMPUS_CACHE_DEFAULT_TIMEOUT_SECONDS = int(os.getenv("KAMPUS_CACHE_DEFAULT_TIMEOUT_SECONDS", "21600"))

if KAMPUS_CACHE_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": KAMPUS_CACHE_URL,
            "TIMEOUT": KAMPUS_CACHE_DEFAULT_TIMEOUT_SECONDS,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "kampus-locmem",
            "TIMEOUT": KAMPUS_CACHE_DEFAULT_TIMEOUT_SECONDS,
        }
    }

# Reports (async PDF jobs)
REPORT_JOBS_TTL_HOURS = int(os.getenv("KAMPUS_REPORT_JOBS_TTL_HOURS", "24"))

# Email (Mailgun)
DEFAULT_FROM_EMAIL = (os.getenv("DEFAULT_FROM_EMAIL") or "no-reply@localhost").strip()
SERVER_EMAIL = (os.getenv("SERVER_EMAIL") or DEFAULT_FROM_EMAIL).strip()
KAMPUS_EMAIL_BACKEND = (os.getenv("KAMPUS_EMAIL_BACKEND") or "console").strip().lower()

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
if KAMPUS_EMAIL_BACKEND == "mailgun":
    EMAIL_BACKEND = "anymail.backends.mailgun.EmailBackend"

ANYMAIL = {
    "MAILGUN_API_KEY": (os.getenv("MAILGUN_API_KEY") or "").strip(),
    "MAILGUN_SENDER_DOMAIN": (os.getenv("MAILGUN_SENDER_DOMAIN") or "").strip(),
}
MAILGUN_API_URL = (os.getenv("MAILGUN_API_URL") or "").strip()
if MAILGUN_API_URL:
    ANYMAIL["MAILGUN_API_URL"] = MAILGUN_API_URL

MAILGUN_WEBHOOK_SIGNING_KEY = (os.getenv("MAILGUN_WEBHOOK_SIGNING_KEY") or "").strip()
MAILGUN_WEBHOOK_STRICT = (os.getenv("MAILGUN_WEBHOOK_STRICT") or ("true" if IS_PRODUCTION else "false")).strip().lower() in {"1", "true", "yes"}
KAMPUS_MAIL_SETTINGS_ENV = (os.getenv("KAMPUS_MAIL_SETTINGS_ENV") or ("production" if IS_PRODUCTION else "development")).strip().lower()

KAMPUS_BACKEND_BASE_URL = (
    _clean_env_url("KAMPUS_BACKEND_BASE_URL")
    or PUBLIC_SITE_URL
    or "http://localhost:8000"
).strip().rstrip("/")
KAMPUS_BACKEND_BASE_URL = _validate_public_base_url(
    "KAMPUS_BACKEND_BASE_URL",
    KAMPUS_BACKEND_BASE_URL,
    required_in_production=True,
)
MARKETING_DEFAULT_OPT_IN = (os.getenv("KAMPUS_MARKETING_DEFAULT_OPT_IN") or "false").strip().lower() in {"1", "true", "yes"}
MARKETING_UNSUBSCRIBE_TOKEN_TTL_SECONDS = int(os.getenv("KAMPUS_MARKETING_UNSUBSCRIBE_TOKEN_TTL_SECONDS", "2592000"))

# WhatsApp (Meta Cloud API)
KAMPUS_WHATSAPP_ENABLED = (os.getenv("KAMPUS_WHATSAPP_ENABLED") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_WHATSAPP_PROVIDER = (os.getenv("KAMPUS_WHATSAPP_PROVIDER") or "meta_cloud_api").strip().lower()
KAMPUS_WHATSAPP_GRAPH_BASE_URL = (os.getenv("KAMPUS_WHATSAPP_GRAPH_BASE_URL") or "https://graph.facebook.com").strip().rstrip("/")
KAMPUS_WHATSAPP_API_VERSION = (os.getenv("KAMPUS_WHATSAPP_API_VERSION") or "v21.0").strip()
KAMPUS_WHATSAPP_PHONE_NUMBER_ID = (os.getenv("KAMPUS_WHATSAPP_PHONE_NUMBER_ID") or "").strip()
KAMPUS_WHATSAPP_ACCESS_TOKEN = (os.getenv("KAMPUS_WHATSAPP_ACCESS_TOKEN") or "").strip()
KAMPUS_WHATSAPP_APP_SECRET = (os.getenv("KAMPUS_WHATSAPP_APP_SECRET") or "").strip()
KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN = (os.getenv("KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN") or "").strip()
KAMPUS_WHATSAPP_WEBHOOK_STRICT = (os.getenv("KAMPUS_WHATSAPP_WEBHOOK_STRICT") or "true").strip().lower() in {"1", "true", "yes"}
KAMPUS_WHATSAPP_HTTP_TIMEOUT_SECONDS = int(os.getenv("KAMPUS_WHATSAPP_HTTP_TIMEOUT_SECONDS", "12"))
KAMPUS_WHATSAPP_SEND_MODE = (os.getenv("KAMPUS_WHATSAPP_SEND_MODE") or "template").strip().lower()
KAMPUS_WHATSAPP_TEMPLATE_FALLBACK_NAME = (os.getenv("KAMPUS_WHATSAPP_TEMPLATE_FALLBACK_NAME") or "").strip()
KAMPUS_WHATSAPP_ALLOW_TEXT_WITHOUT_TEMPLATE = (os.getenv("KAMPUS_WHATSAPP_ALLOW_TEXT_WITHOUT_TEMPLATE") or "false").strip().lower() in {"1", "true", "yes"}
KAMPUS_WHATSAPP_THROTTLE_PER_PHONE_PER_MINUTE = int(os.getenv("KAMPUS_WHATSAPP_THROTTLE_PER_PHONE_PER_MINUTE", "20"))
KAMPUS_WHATSAPP_THROTTLE_PER_INSTITUTION_PER_MINUTE = int(os.getenv("KAMPUS_WHATSAPP_THROTTLE_PER_INSTITUTION_PER_MINUTE", "200"))

KAMPUS_WHATSAPP_ALERT_MAX_FAILED = int(os.getenv("KAMPUS_WHATSAPP_ALERT_MAX_FAILED", "10"))
KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE = float(os.getenv("KAMPUS_WHATSAPP_ALERT_MIN_SUCCESS_RATE", "90.0"))
KAMPUS_WHATSAPP_ALERT_FAIL_ON_BREACH = (os.getenv("KAMPUS_WHATSAPP_ALERT_FAIL_ON_BREACH") or "false").strip().lower() in {"1", "true", "yes"}

