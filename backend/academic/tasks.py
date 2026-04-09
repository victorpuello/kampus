from __future__ import annotations

import logging

from celery import shared_task
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.services import create_notification

from .commission_annotation_services import generate_close_observer_annotations_for_commission


logger = logging.getLogger(__name__)


def _build_summary_body(summary: dict) -> str:
	commission_title = str(summary.get("commission_title") or f"Comisión {summary.get('commission_id')}").strip()
	period_name = str(summary.get("period_name") or "cierre anual").strip()
	group_label = str(summary.get("group_label") or "grupo no especificado").strip()
	errors_count = len(summary.get("errors") or [])
	body = (
		f"{commission_title} ({group_label}, {period_name}): "
		f"{int(summary.get('praise_created', 0)) + int(summary.get('praise_updated', 0))} felicitación(es), "
		f"{int(summary.get('alert_created', 0)) + int(summary.get('alert_updated', 0))} llamado(s) de atención y "
		f"{int(summary.get('commitment_created', 0)) + int(summary.get('commitment_updated', 0))} compromiso(s) generados automáticamente."
	)
	if errors_count:
		body = f"{body} Se registraron {errors_count} incidencia(s) parcial(es) durante el procesamiento."
	return body


def _notify_closing_user(*, user, summary: dict) -> None:
	if user is None:
		return

	dedupe_key = f"commission-close-ai-user:{int(summary.get('commission_id') or 0)}:{int(user.id)}"
	if Notification.objects.filter(recipient=user, dedupe_key=dedupe_key).exists():
		return

	Notification.objects.create(
		recipient=user,
		type="COMMISSION_CLOSE_AI_USER",
		title="Anotaciones automáticas de comisión generadas",
		body=_build_summary_body(summary),
		url="/notifications",
		dedupe_key=dedupe_key,
	)


def _notify_superadmins(*, closed_by_user_id: int | None, summary: dict) -> None:
	User = get_user_model()
	superadmins = list(
		User.objects.filter(role=User.ROLE_SUPERADMIN, is_active=True).only("id", "email", "username", "first_name", "last_name")
	)

	for superadmin in superadmins:
		try:
			create_notification(
				recipient=superadmin,
				type="COMMISSION_CLOSE_AI_SUPERADMIN",
				title="Resultado de anotaciones automáticas por cierre de comisión",
				body=_build_summary_body(summary),
				url="/notifications",
				dedupe_key=f"commission-close-ai-superadmin:{int(summary.get('commission_id') or 0)}:{int(superadmin.id)}",
				dedupe_within_seconds=60 * 60 * 24 * 30,
			)
		except Exception:
			logger.exception(
				"Error notifying superadmin about commission close AI generation",
				extra={"commission_id": summary.get("commission_id"), "recipient_id": superadmin.id},
			)


@shared_task(
	name="academic.generate_commission_observer_annotations",
	autoretry_for=(Exception,),
	retry_backoff=True,
	retry_kwargs={"max_retries": 3},
)
def generate_commission_observer_annotations_task(commission_id: int, closed_by_user_id: int | None = None) -> dict:
	summary = generate_close_observer_annotations_for_commission(
		commission_id=int(commission_id),
		closed_by_user_id=closed_by_user_id,
	)

	User = get_user_model()
	closing_user = User.objects.filter(id=closed_by_user_id).first() if closed_by_user_id else None
	if closing_user is not None and getattr(closing_user, "role", None) != User.ROLE_SUPERADMIN:
		try:
			_notify_closing_user(user=closing_user, summary=summary)
		except Exception:
			logger.exception(
				"Error creating in-app notification for commission closing user",
				extra={"commission_id": summary.get("commission_id"), "recipient_id": closing_user.id},
			)

	_notify_superadmins(closed_by_user_id=closed_by_user_id, summary=summary)
	return summary