from __future__ import annotations

import logging
from io import StringIO

from celery import shared_task
from django.core.cache import cache
from django.core.management import call_command

from communications.models import WhatsAppContact
from communications.observability import emit_notification_event
from communications.institution_resolver import resolve_institution_for_user
from communications.whatsapp_service import send_whatsapp_notification
from notifications.models import Notification
from reports.models import PeriodicJobRun


logger = logging.getLogger(__name__)


@shared_task(name="notifications.check_notifications_health")
def check_notifications_health_task(periodic_run_id: int | None = None) -> None:
    lock_key = "periodic-job-lock:check-notifications-health"
    if not cache.add(lock_key, "1", timeout=3600):
        logger.info("Skipping check_notifications_health task because lock is active")
        return

    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command("check_notifications_health", stdout=buffer, stderr=buffer)
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando check_notifications_health",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task check_notifications_health")
        raise
    finally:
        cache.delete(lock_key)


@shared_task(name="notifications.send_notification_whatsapp", autoretry_for=(Exception,), retry_backoff=True, max_retries=4)
def send_notification_whatsapp_task(notification_id: int, idempotency_key: str = "") -> None:
    emit_notification_event(
        logger,
        event="notification.whatsapp.task.start",
        notification_id=notification_id,
        dedupe_key="",
        idempotency_key=idempotency_key,
        channel="whatsapp",
        institution_id="",
    )

    notification = Notification.objects.select_related("recipient").filter(id=notification_id).first()
    if notification is None:
        emit_notification_event(
            logger,
            event="notification.whatsapp.task.skipped.notification_not_found",
            notification_id=notification_id,
            dedupe_key="",
            idempotency_key=idempotency_key,
            channel="whatsapp",
            institution_id="",
        )
        return

    contact = WhatsAppContact.objects.filter(user=notification.recipient, is_active=True).first()
    if contact is None:
        emit_notification_event(
            logger,
            event="notification.whatsapp.task.skipped.no_active_contact",
            notification_id=notification.id,
            dedupe_key=notification.dedupe_key,
            idempotency_key=idempotency_key,
            channel="whatsapp",
            institution_id="",
        )
        return

    recipient = notification.recipient
    institution = resolve_institution_for_user(recipient)
    absolute_url = (notification.url or "").strip()
    body_parts = [
        f"Hola {recipient.get_full_name() or recipient.username},",
        notification.title,
    ]
    if notification.body:
        body_parts.append(notification.body)
    if absolute_url:
        body_parts.append(f"Detalle: {absolute_url}")

    send_whatsapp_notification(
        recipient_phone=contact.phone_number,
        notification_type=notification.type,
        recipient_name=recipient.get_full_name() or recipient.username,
        title=notification.title,
        body=notification.body or "Tienes una nueva notificación en Kampus.",
        action_url=absolute_url,
        idempotency_key=idempotency_key,
        fallback_text="\n\n".join(body_parts),
        institution_id=(institution.id if institution else None),
    )
    emit_notification_event(
        logger,
        event="notification.whatsapp.task.sent",
        notification_id=notification.id,
        dedupe_key=notification.dedupe_key,
        idempotency_key=idempotency_key,
        channel="whatsapp",
        institution_id=(institution.id if institution else ""),
    )


@shared_task(name="notifications.check_whatsapp_health")
def check_whatsapp_health_task(periodic_run_id: int | None = None) -> None:
    lock_key = "periodic-job-lock:check-whatsapp-health"
    if not cache.add(lock_key, "1", timeout=3600):
        logger.info("Skipping check_whatsapp_health task because lock is active")
        return

    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command("check_whatsapp_health", stdout=buffer, stderr=buffer)
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando check_whatsapp_health",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task check_whatsapp_health")
        raise
    finally:
        cache.delete(lock_key)


@shared_task(name="notifications.process_dispatch_outbox")
def process_dispatch_outbox_task(
    batch_size: int = 100,
    max_retries: int = 5,
    periodic_run_id: int | None = None,
) -> None:
    lock_key = "periodic-job-lock:process-notification-dispatch-outbox"
    if not cache.add(lock_key, "1", timeout=3600):
        logger.info("Skipping process_dispatch_outbox task because lock is active")
        return

    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command(
            "process_notification_dispatches",
            batch_size=max(1, int(batch_size)),
            max_retries=max(1, int(max_retries)),
            stdout=buffer,
            stderr=buffer,
        )
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando process_notification_dispatches",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task process_dispatch_outbox")
        raise
    finally:
        cache.delete(lock_key)


@shared_task(name="notifications.check_dispatch_outbox_health")
def check_dispatch_outbox_health_task(periodic_run_id: int | None = None) -> None:
    lock_key = "periodic-job-lock:check-dispatch-outbox-health"
    if not cache.add(lock_key, "1", timeout=3600):
        logger.info("Skipping check_dispatch_outbox_health task because lock is active")
        return

    run = PeriodicJobRun.objects.filter(id=periodic_run_id).first() if periodic_run_id else None
    buffer = StringIO()

    if run is not None:
        run.mark_running()

    try:
        call_command("check_dispatch_outbox_health", stdout=buffer, stderr=buffer)
        if run is not None:
            run.mark_succeeded(output_text=buffer.getvalue().strip()[:20000])
    except Exception:
        if run is not None:
            run.mark_failed(
                error_message="Error ejecutando check_dispatch_outbox_health",
                output_text=buffer.getvalue().strip()[:20000],
            )
        logger.exception("Failed executing scheduled task check_dispatch_outbox_health")
        raise
    finally:
        cache.delete(lock_key)
