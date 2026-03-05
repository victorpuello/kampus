from __future__ import annotations

import logging
from io import StringIO

from celery import shared_task
from django.core.cache import cache
from django.core.management import call_command

from reports.models import PeriodicJobRun


logger = logging.getLogger(__name__)


@shared_task(name="novelties.notify_novelties_sla")
def notify_novelties_sla_task(periodic_run_id: int | None = None) -> None:
    lock_key = "periodic-job-lock:notify-novelties-sla"
    if not cache.add(lock_key, "1", timeout=3600):
        logger.info("Skipping notify_novelties_sla task because lock is active")
        return

    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command("notify_novelties_sla", stdout=buffer, stderr=buffer)
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando notify_novelties_sla",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task notify_novelties_sla")
        raise
    finally:
        cache.delete(lock_key)
