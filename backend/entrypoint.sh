#!/bin/sh

set -e

DJANGO_ENV_NORMALIZED=$(echo "${DJANGO_ENV:-development}" | tr '[:upper:]' '[:lower:]')

if [ "$DJANGO_ENV_NORMALIZED" = "production" ]; then
  if [ -z "${DJANGO_SECRET_KEY:-}" ]; then
    echo "ERROR: DJANGO_SECRET_KEY is required when DJANGO_ENV=production"
    exit 1
  fi

  case "${DJANGO_SECRET_KEY}" in
    django-insecure* )
      echo "ERROR: DJANGO_SECRET_KEY cannot use django-insecure pattern in production"
      exit 1
      ;;
  esac

  if [ -z "${DJANGO_ALLOWED_HOSTS:-}" ]; then
    echo "ERROR: DJANGO_ALLOWED_HOSTS is required when DJANGO_ENV=production"
    exit 1
  fi

  if [ "${DJANGO_DEBUG:-false}" = "true" ]; then
    echo "ERROR: DJANGO_DEBUG must be false when DJANGO_ENV=production"
    exit 1
  fi
fi

if [ "$POSTGRES_HOST" ]
then
    echo "Waiting for postgres at $POSTGRES_HOST:$POSTGRES_PORT..."

    while ! nc -z $POSTGRES_HOST $POSTGRES_PORT; do
      sleep 0.5
    done

    echo "PostgreSQL started"
fi

# Run migrations
if [ "${KAMPUS_RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running migrations..."
  python manage.py migrate
else
  echo "Skipping migrations (KAMPUS_RUN_MIGRATIONS=false)"
fi

# Create superuser
if [ "${KAMPUS_CREATE_SUPERUSER:-false}" = "true" ]; then
  SUPERUSER_USERNAME="${KAMPUS_SUPERUSER_USERNAME:-admin}"
  SUPERUSER_EMAIL="${KAMPUS_SUPERUSER_EMAIL:-admin@kampus.com}"
  SUPERUSER_PASSWORD="${KAMPUS_SUPERUSER_PASSWORD:-}"

  if [ -z "$SUPERUSER_PASSWORD" ]; then
    echo "ERROR: KAMPUS_SUPERUSER_PASSWORD is required when KAMPUS_CREATE_SUPERUSER=true"
    exit 1
  fi

  if [ ${#SUPERUSER_PASSWORD} -lt 12 ]; then
    echo "ERROR: KAMPUS_SUPERUSER_PASSWORD must be at least 12 characters"
    exit 1
  fi

  if [ "$SUPERUSER_PASSWORD" = "admin123" ] || [ "$SUPERUSER_PASSWORD" = "$SUPERUSER_USERNAME" ]; then
    echo "ERROR: KAMPUS_SUPERUSER_PASSWORD is too weak"
    exit 1
  fi

  echo "Creating superuser..."
  python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='${SUPERUSER_USERNAME}').exists() or User.objects.create_superuser('${SUPERUSER_USERNAME}', '${SUPERUSER_EMAIL}', '${SUPERUSER_PASSWORD}', role='SUPERADMIN')"
else
  echo "Skipping superuser creation (KAMPUS_CREATE_SUPERUSER=false)"
fi

exec "$@"
