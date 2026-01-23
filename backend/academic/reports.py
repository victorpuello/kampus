from __future__ import annotations

from typing import Any

from django.utils import timezone

from academic.models import Group, Period, TeacherAssignment
from core.models import Institution
from students.models import Enrollment


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
