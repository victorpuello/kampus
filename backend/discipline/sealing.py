from __future__ import annotations

import hashlib
import json
from typing import Any

from django.utils import timezone

from .models import (
	DisciplineCase,
	DisciplineCaseAttachment,
	DisciplineCaseEvent,
	DisciplineCaseNotificationLog,
	DisciplineCaseParticipant,
)


def _dt(value):
	if not value:
		return None
	try:
		return timezone.localtime(value).isoformat()
	except Exception:
		try:
			return value.isoformat()
		except Exception:
			return str(value)


def build_case_seal_payload(case: DisciplineCase) -> dict[str, Any]:
	cutoff = getattr(case, "sealed_at", None)
	participants_qs = case.participants.all()
	attachments_qs = case.attachments.all()
	events_qs = case.events.all()
	notification_logs_qs = case.notification_logs.all()
	if cutoff is not None:
		participants_qs = participants_qs.filter(created_at__lte=cutoff)
		attachments_qs = attachments_qs.filter(uploaded_at__lte=cutoff)
		events_qs = events_qs.filter(created_at__lte=cutoff)
		notification_logs_qs = notification_logs_qs.filter(created_at__lte=cutoff)

	participants = list(participants_qs.order_by("id"))
	attachments = list(attachments_qs.order_by("id"))
	events = list(events_qs.order_by("created_at", "id"))
	notification_logs = list(notification_logs_qs.order_by("created_at", "id"))

	return {
		"case": {
			"id": case.id,
			"enrollment_id": case.enrollment_id,
			"student_id": case.student_id,
			"occurred_at": _dt(case.occurred_at),
			"location": case.location,
			"narrative": case.narrative,
			"manual_severity": case.manual_severity,
			"law_1620_type": case.law_1620_type,
			"status": case.status,
			"notified_guardian_at": _dt(case.notified_guardian_at),
			"descargos_due_at": _dt(case.descargos_due_at),
			"decided_at": _dt(case.decided_at),
			"decided_by_id": case.decided_by_id,
			"decision_text": case.decision_text,
			"closed_at": _dt(case.closed_at),
			"closed_by_id": case.closed_by_id,
			"sealed_at": _dt(case.sealed_at),
			"sealed_by_id": case.sealed_by_id,
			"created_by_id": case.created_by_id,
			"created_at": _dt(case.created_at),
		},
		"participants": [
			{
				"id": p.id,
				"student_id": p.student_id,
				"role": p.role,
				"notes": p.notes,
				"created_at": _dt(p.created_at),
			}
			for p in participants
		],
		"attachments": [
			{
				"id": a.id,
				"kind": a.kind,
				"file": (a.file.name if getattr(a, "file", None) else ""),
				"description": a.description,
				"uploaded_by_id": a.uploaded_by_id,
				"uploaded_at": _dt(a.uploaded_at),
			}
			for a in attachments
		],
		"events": [
			{
				"id": e.id,
				"event_type": e.event_type,
				"text": e.text,
				"created_by_id": e.created_by_id,
				"created_at": _dt(e.created_at),
			}
			for e in events
		],
		"notification_logs": [
			{
				"id": n.id,
				"channel": n.channel,
				"status": n.status,
				"recipient_user_id": n.recipient_user_id,
				"recipient_family_member_id": n.recipient_family_member_id,
				"recipient_name": n.recipient_name,
				"recipient_contact": n.recipient_contact,
				"note": n.note,
				"external_id": n.external_id,
				"error": n.error,
				"created_by_id": n.created_by_id,
				"created_at": _dt(n.created_at),
				"acknowledged_at": _dt(n.acknowledged_at),
				"acknowledged_by_id": n.acknowledged_by_id,
			}
			for n in notification_logs
		],
	}


def compute_case_seal_hash(case: DisciplineCase) -> str:
	payload = build_case_seal_payload(case)
	data = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
	return hashlib.sha256(data).hexdigest()
