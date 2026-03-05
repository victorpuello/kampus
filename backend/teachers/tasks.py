from __future__ import annotations

import logging
from io import StringIO

from celery import shared_task
from django.core.management import call_command

from reports.models import PeriodicJobRun


logger = logging.getLogger(__name__)


@shared_task(name="teachers.notify_pending_planning_teachers")
def notify_pending_planning_teachers_task(periodic_run_id: int | None = None) -> None:
    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command("notify_pending_planning_teachers", stdout=buffer, stderr=buffer)
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando notify_pending_planning_teachers",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task notify_pending_planning_teachers")
        raise
