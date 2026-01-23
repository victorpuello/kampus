import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kampus_backend.settings")

app = Celery("kampus_backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
