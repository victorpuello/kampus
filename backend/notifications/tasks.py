from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command


logger = logging.getLogger(__name__)


@shared_task(name="notifications.check_notifications_health")
def check_notifications_health_task() -> None:
    try:
        call_command("check_notifications_health")
    except Exception:
        logger.exception("Failed executing scheduled task check_notifications_health")
        raise
