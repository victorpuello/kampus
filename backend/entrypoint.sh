#!/bin/sh

set -e

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
if [ "${KAMPUS_CREATE_SUPERUSER:-true}" = "true" ]; then
  echo "Creating superuser..."
  python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@kampus.com', 'admin123', role='SUPERADMIN')"
else
  echo "Skipping superuser creation (KAMPUS_CREATE_SUPERUSER=false)"
fi

exec "$@"
