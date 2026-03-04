from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command


logger = logging.getLogger(__name__)


@shared_task(name="novelties.notify_novelties_sla")
def notify_novelties_sla_task() -> None:
    try:
        call_command("notify_novelties_sla")
    except Exception:
        logger.exception("Failed executing scheduled task notify_novelties_sla")
        raise
