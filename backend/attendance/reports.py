from __future__ import annotations

from typing import Any

from django.utils import timezone

from academic.models import Group, TeacherAssignment
from core.models import Institution
from students.models import Enrollment


def user_can_access_group(user, group: Group) -> bool:
	if not user or not getattr(user, "is_authenticated", False):
		return False

	if getattr(user, "role", None) == "TEACHER":
		if group.director_id == user.id:
			return True
		return TeacherAssignment.objects.filter(teacher_id=user.id, group_id=group.id).exists()

	return True


def build_attendance_manual_sheet_context(*, group: Group, user, columns: int) -> dict[str, Any]:
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
			director_name = group.director.get_full_name().upper()
	except Exception:
		director_name = ""

	institution = Institution.objects.first() or Institution(name="")
	base_logo_height = int(getattr(institution, "pdf_logo_height_px", 60) or 60)
	logo_height_px = max(18, int(round(base_logo_height * 0.67)))

	# Dynamic column sizing for PDF:
	# We approximate the available table width in CSS px for A4 portrait:
	# 210mm - 10mm(left) - 10mm(right) = 190mm -> ~718px at 96dpi.
	page_width_px = 718
	num_width_px = 18
	cell_width_px = 12
	if max_name_len >= 36:
		cell_width_px = 10
	if max_name_len >= 46:
		cell_width_px = 9

	# Rough overhead for borders/padding.
	overhead_px = 28
	available_name_px = page_width_px - num_width_px - (columns * cell_width_px) - overhead_px
	available_name_px = max(140, min(420, available_name_px))

	# Desired width based on content length, capped by available.
	desired_name_px = int(140 + max(0, max_name_len - 18) * 5)
	name_width_px = max(160, min(available_name_px, desired_name_px))

	name_font_size_px = 9
	if max_name_len >= 38:
		name_font_size_px = 8
	if max_name_len >= 50:
		name_font_size_px = 7

	def _upper(s: str) -> str:
		return (s or "").strip().upper()

	printed_by_name = ""
	teacher_name = ""
	try:
		if getattr(user, "is_authenticated", False):
			printed_by_name = _upper(user.get_full_name())
			if not printed_by_name:
				printed_by_name = _upper(getattr(user, "username", ""))

		if getattr(user, "role", None) == "TEACHER":
			teacher_name = printed_by_name
			if not teacher_name:
				first = _upper(getattr(user, "first_name", ""))
				last = _upper(getattr(user, "last_name", ""))
				teacher_name = (last + " " + first).strip()
	except Exception:
		printed_by_name = ""
		teacher_name = ""

	return {
		"institution": institution,
		"logo_height_px": logo_height_px,
		"teacher_name": teacher_name,
		"printed_by_name": printed_by_name,
		"group_label": group_label,
		"shift": group.get_shift_display(),
		"printed_at": printed_at,
		"director_name": director_name,
		"students": students,
		"columns": list(range(columns)),
		"name_width_px": name_width_px,
		"name_font_size_px": name_font_size_px,
		"num_width_px": num_width_px,
		"cell_width_px": cell_width_px,
	}
