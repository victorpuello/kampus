from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from django.utils import timezone

from academic.promotion import PASSING_SCORE_DEFAULT, _compute_subject_final_for_enrollments, compute_promotions_for_year
from academic.models import Group, Period, TeacherAssignment
from core.models import Institution
from students.models import Enrollment, FamilyMember

from .models import Commission, CommissionStudentDecision, Subject


def _default_commitments_payload() -> dict[str, list[str]]:
	return {
		"student_commitments": [
			"Asistir puntualmente a clases.",
			"Cumplir con las actividades académicas asignadas.",
			"Participar activamente en clases y refuerzos.",
			"Solicitar apoyo a los docentes cuando se presenten dudas.",
		],
		"guardian_commitments": [
			"Realizar seguimiento permanente a las tareas y compromisos académicos del estudiante.",
			"Asistir a las citaciones realizadas por la institución.",
			"Brindar el acompañamiento necesario en casa.",
			"Fomentar un ambiente propicio para el estudio.",
		],
		"institution_commitments": [
			"Brindar el acompañamiento pedagógico necesario.",
			"Ofrecer espacios de refuerzo académico.",
			"Informar oportunamente sobre avances o retrocesos del estudiante.",
			"Apoyar el proceso a través del equipo de orientación escolar.",
		],
	}


def _parse_commitments_payload(raw_value: str | None) -> dict[str, list[str]]:
	defaults = _default_commitments_payload()
	raw = (raw_value or "").strip()
	if not raw:
		return defaults

	try:
		parsed = json.loads(raw)
	except Exception:
		lines = [line.strip(" -•\t") for line in raw.splitlines() if line.strip()]
		if lines:
			defaults["student_commitments"] = lines
		return defaults

	if not isinstance(parsed, dict):
		return defaults

	for key in ("student_commitments", "guardian_commitments", "institution_commitments"):
		values = parsed.get(key)
		if isinstance(values, list):
			clean_values = [str(item).strip() for item in values if str(item).strip()]
			if clean_values:
				defaults[key] = clean_values

	return defaults


def get_failed_subject_names_for_decision(decision: CommissionStudentDecision) -> list[str]:
	commission = decision.commission
	enrollment = decision.enrollment
	failed_subject_ids: set[int] = set()

	if commission.commission_type == Commission.TYPE_PROMOTION:
		computed = compute_promotions_for_year(
			academic_year=commission.academic_year,
			passing_score=Decimal(PASSING_SCORE_DEFAULT),
		)
		result = computed.get(int(enrollment.id))
		for subject_id in getattr(result, "failed_subject_ids", []) or []:
			failed_subject_ids.add(int(subject_id))
	elif commission.commission_type == Commission.TYPE_EVALUATION and commission.period_id:
		assignments = (
			TeacherAssignment.objects.filter(
				academic_year_id=commission.academic_year_id,
				group_id=enrollment.group_id,
				academic_load__subject__isnull=False,
			)
			.select_related("academic_load", "academic_load__subject")
			.only("id", "academic_load__subject_id")
		)
		passing_score = Decimal(PASSING_SCORE_DEFAULT)
		for assignment in assignments:
			finals = _compute_subject_final_for_enrollments(
				teacher_assignment=assignment,
				period=commission.period,
				enrollment_ids=[int(enrollment.id)],
			)
			score = finals.get(int(enrollment.id))
			if score is None:
				continue
			if Decimal(score) < passing_score:
				failed_subject_ids.add(int(assignment.academic_load.subject_id))

	if not failed_subject_ids:
		return []

	return list(
		Subject.objects.filter(id__in=failed_subject_ids).order_by("name").values_list("name", flat=True)
	)


def user_can_access_group(user, group: Group) -> bool:
	if not user or not getattr(user, "is_authenticated", False):
		return False

	role = getattr(user, "role", None)
	if role == "TEACHER":
		if group.director_id == getattr(user, "id", None):
			return True
		return TeacherAssignment.objects.filter(teacher_id=user.id, group_id=group.id).exists()

	# Administrative roles and others handled by caller/permissions.
	return True


def build_grade_report_sheet_context(
	*,
	group: Group,
	user,
	columns: int,
	period_id: int | None,
	subject_name: str,
	teacher_name: str,
) -> dict[str, Any]:
	def _upper(s: str) -> str:
		return (s or "").strip().upper()

	note_cols = max(1, min(int(columns), 12))
	note_columns = [f"Nota {i}" for i in range(1, note_cols + 1)]

	period_name = ""
	if period_id is not None:
		try:
			period = Period.objects.select_related("academic_year").get(id=period_id)
			if period.academic_year_id == group.academic_year_id:
				period_name = (period.name or "").strip()
		except Period.DoesNotExist:
			period_name = ""

	subject_name = (subject_name or "").strip()
	teacher_name = (teacher_name or "").strip()
	if not teacher_name:
		try:
			if getattr(user, "is_authenticated", False) and getattr(user, "role", None) == "TEACHER":
				teacher_name = _upper(user.get_full_name())
		except Exception:
			teacher_name = ""

	enrollments = (
		Enrollment.objects.select_related("student", "student__user")
		.filter(academic_year_id=group.academic_year_id, group_id=group.id, status="ACTIVE")
		.order_by("student__user__last_name", "student__user__first_name", "student__user__id")
	)

	def _display_name(e: Enrollment) -> str:
		last_name = (e.student.user.last_name or "").strip().upper()
		first_name = (e.student.user.first_name or "").strip().upper()
		full = (last_name + " " + first_name).strip()
		return full or e.student.user.get_full_name().upper() or ""

	students = [{"index": i + 1, "display_name": _display_name(e)} for i, e in enumerate(enrollments)]
	max_name_len = max((len((s.get("display_name") or "").strip()) for s in students), default=0)

	grade_label = str(getattr(group.grade, "name", "")).strip() if getattr(group, "grade", None) else ""
	group_label = f"{grade_label}-{group.name}" if grade_label else str(group.name)
	d = timezone.localdate()
	printed_at = f"{d.month}/{d.day}/{d.year}"

	director_name = ""
	try:
		if group.director:
			director_name = _upper(group.director.get_full_name())
	except Exception:
		director_name = ""

	institution = Institution.objects.first() or Institution(name="")

	# Dynamic column sizing for the PDF grid.
	# A4 width is ~793px at 96dpi; with 1.5cm margins each side we have ~680px.
	page_width_px = 680
	num_width_px = 32

	# Base width for grade cells, adjusted by how many columns we need to fit.
	# +1 for the "Def." column.
	cells_count = note_cols + 1
	if cells_count >= 11:
		cell_width_px = 34
	elif cells_count >= 9:
		cell_width_px = 38
	elif cells_count >= 7:
		cell_width_px = 40
	else:
		cell_width_px = 44

	# If names are long, shrink grade cells a bit further to give more room.
	if max_name_len >= 46:
		cell_width_px = min(cell_width_px, 34)
	elif max_name_len >= 36:
		cell_width_px = min(cell_width_px, 38)

	overhead_px = 28
	available_name_px = page_width_px - num_width_px - (cells_count * cell_width_px) - overhead_px
	# Never exceed what is actually available (otherwise the fixed-layout table will overflow).
	available_name_px = max(60, available_name_px)

	# Desired width based on content length, capped by available.
	desired_name_px = int(180 + max(0, max_name_len - 18) * 6)
	name_width_px = max(60, min(available_name_px, desired_name_px))

	name_font_size_px = 9
	if max_name_len >= 38:
		name_font_size_px = 8
	if max_name_len >= 52:
		name_font_size_px = 7

	return {
		"institution": institution,
		"teacher_name": teacher_name,
		"group_label": group_label,
		"shift": group.get_shift_display(),
		"printed_at": printed_at,
		"period_name": period_name,
		"subject_name": subject_name,
		"director_name": director_name,
		"students": students,
		"note_columns": note_columns,
		"name_width_px": name_width_px,
		"name_font_size_px": name_font_size_px,
		"num_width_px": num_width_px,
		"cell_width_px": cell_width_px,
	}


def build_commitment_acta_context(
	*,
	decision: CommissionStudentDecision,
	generated_by,
) -> dict[str, Any]:
	commission = decision.commission
	enrollment = decision.enrollment
	student = enrollment.student
	student_user = student.user
	group = getattr(enrollment, "group", None)
	director = getattr(group, "director", None) if group else None
	campus = getattr(enrollment, "campus", None)
	institution = getattr(campus, "institution", None) if campus else None
	if institution is None:
		institution = Institution.objects.first() or Institution(name="")

	guardian = (
		FamilyMember.objects.filter(student=student)
		.order_by("-is_main_guardian", "id")
		.first()
	)

	acta = getattr(decision, "commitment_acta", None)
	commitments_payload = _parse_commitments_payload(getattr(acta, "commitments", "") or (decision.notes or ""))
	failed_subject_names = get_failed_subject_names_for_decision(decision)
	meeting_date = timezone.localdate(getattr(acta, "generated_at", None) or timezone.now())
	day = meeting_date.day
	month_name = {
		1: "enero",
		2: "febrero",
		3: "marzo",
		4: "abril",
		5: "mayo",
		6: "junio",
		7: "julio",
		8: "agosto",
		9: "septiembre",
		10: "octubre",
		11: "noviembre",
		12: "diciembre",
	}.get(meeting_date.month, "")
	year = meeting_date.year
	location = (
		getattr(campus, "municipality", "")
		or getattr(campus, "name", "")
		or getattr(institution, "pdf_header_line3", "")
		or ""
	)
	place_line = f"Dado en {location}" if location else "Dado en"
	rector_user = getattr(institution, "rector", None)
	rector_name = ""
	if rector_user is not None:
		rector_name = (rector_user.get_full_name() or rector_user.username or "").strip()

	return {
		"institution": institution,
		"commission": commission,
		"decision": decision,
		"acta": acta,
		"enrollment": enrollment,
		"student": student,
		"student_name": student_user.get_full_name(),
		"student_document": student.document_number or "",
		"grade_name": getattr(getattr(enrollment, "grade", None), "name", "") or "",
		"group_name": getattr(group, "name", "") if group else "",
		"director_name": director.get_full_name() if director is not None else "",
		"guardian_name": getattr(guardian, "full_name", "") or "",
		"period_name": getattr(getattr(commission, "period", None), "name", "") if commission.period_id else "",
		"academic_year": getattr(getattr(commission, "academic_year", None), "year", ""),
		"failed_subject_names": failed_subject_names,
		"meeting_day": day,
		"meeting_month_name": month_name,
		"meeting_year": year,
		"meeting_date": meeting_date,
		"place_line": place_line,
		"student_commitments": commitments_payload["student_commitments"],
		"guardian_commitments": commitments_payload["guardian_commitments"],
		"institution_commitments": commitments_payload["institution_commitments"],
		"rector_name": rector_name,
		"generated_by": generated_by,
		"generated_at": timezone.now(),
	}
