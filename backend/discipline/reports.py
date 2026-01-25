from __future__ import annotations

from typing import Any

from django.utils import timezone

from core.models import Institution
from students.models import FamilyMember

from .models import DisciplineCaseEvent, DisciplineCase


def build_case_acta_context(*, case: DisciplineCase, generated_by) -> dict[str, Any]:
	enrollment = case.enrollment
	campus = getattr(enrollment, "campus", None) if enrollment else None
	institution = getattr(campus, "institution", None) if campus else Institution.objects.first()
	group = getattr(enrollment, "group", None) if enrollment else None
	group_director = getattr(group, "director", None) if group else None
	guardian = (
		FamilyMember.objects.filter(student=case.student)
		.select_related("user")
		.order_by("-is_main_guardian", "id")
		.first()
	)

	# For the PDF acta, we show the decision in its own section (near signatures),
	# so we avoid duplicating it in the event listings.
	events = list(case.events.exclude(event_type=DisciplineCaseEvent.Type.DECISION))

	attachments = list(case.attachments.all())
	image_exts = (".png", ".jpg", ".jpeg", ".webp")
	attachments_for_acta = []
	for a in attachments:
		file_name = getattr(getattr(a, "file", None), "name", "") or ""
		file_url = getattr(getattr(a, "file", None), "url", "") or ""
		lower_name = file_name.lower()
		is_image = bool(file_url) and any(lower_name.endswith(ext) for ext in image_exts)
		attachments_for_acta.append(
			{
				"kind_display": a.get_kind_display(),
				"uploaded_at": getattr(a, "uploaded_at", None),
				"file_name": file_name,
				"file_url": file_url,
				"description": getattr(a, "description", "") or "",
				"is_image": is_image,
			}
		)
	action_event_types = {
		DisciplineCaseEvent.Type.NOTIFIED_GUARDIAN,
		DisciplineCaseEvent.Type.DESCARGOS,
		DisciplineCaseEvent.Type.CLOSED,
	}
	action_note_markers = (
		"Fecha límite",
		"Fecha limite",
		"Acuse/enterado",
		"Notificación automática",
		"Notificacion automática",
	)

	actions_taken = []
	for e in events:
		if e.event_type in action_event_types:
			actions_taken.append(e)
		elif e.event_type == DisciplineCaseEvent.Type.NOTE and (e.text or "").strip():
			text = (e.text or "").strip()
			if any(marker in text for marker in action_note_markers):
				actions_taken.append(e)

	return {
		"case": case,
		"student": case.student,
		"enrollment": enrollment,
		"group": group,
		"group_director": group_director,
		"guardian": guardian,
		"campus": campus,
		"institution": institution,
		"participants": list(case.participants.all()),
		"attachments": attachments,
		"attachments_for_acta": attachments_for_acta,
		"events": events,
		"actions_taken": actions_taken,
		"generated_at": timezone.now(),
		"generated_by": generated_by,
	}
