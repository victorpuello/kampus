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

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Discipline / Observador settings
DISCIPLINE_DESCARGOS_DUE_DAYS = int(os.getenv("DISCIPLINE_DESCARGOS_DUE_DAYS", "3"))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-@&8b1fjjrgak3)rz@qcrein4kgrshj)$4np$co9r0fc#%jwo3v",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = (
    os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")
    if os.getenv("DJANGO_ALLOWED_HOSTS")
    else (["*"] if DEBUG else [])
)

# Public-facing base URL used for QR verification links.
# Example: https://colegio.midominio.com
# If not set, we fall back to request.build_absolute_uri(), which depends on
# correct reverse-proxy headers.
PUBLIC_SITE_URL = (os.getenv("KAMPUS_PUBLIC_SITE_URL") or "").strip().rstrip("/")

# Public verification throttling (DRF). Example values: "60/min", "100/hour".
PUBLIC_VERIFY_THROTTLE_RATE = (os.getenv("KAMPUS_PUBLIC_VERIFY_THROTTLE_RATE") or "60/min").strip()

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

    # Local apps
    "core",
    "users",
    "students",
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

# Archivos de medios (si aplica en el futuro)
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

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
        "rest_framework_simplejwt.authentication.JWTAuthentication",
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
}

# CORS
CORS_ALLOWED_ORIGINS = [
    origin
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

if DEBUG and not CORS_ALLOWED_ORIGINS:
    CORS_ALLOW_ALL_ORIGINS = True

# Usuario personalizado
AUTH_USER_MODEL = "users.User"

# Google Gemini API Key
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Celery (async jobs)
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = os.getenv("CELERY_TASK_EAGER_PROPAGATES", "true").lower() == "true"

# Reports (async PDF jobs)
REPORT_JOBS_TTL_HOURS = int(os.getenv("KAMPUS_REPORT_JOBS_TTL_HOURS", "24"))

