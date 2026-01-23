from __future__ import annotations

import re
from typing import Any

from core.models import Institution

from academic.models import AcademicYear, Grade, Group
from .models import Enrollment


def _natural_sort_key(value: str) -> tuple[tuple[int, object], ...]:
	parts = re.split(r"(\d+)", (value or "").strip().upper())
	key: list[tuple[int, object]] = []
	for part in parts:
		if part == "":
			continue
		if part.isdigit():
			key.append((0, int(part)))
		else:
			key.append((1, part))
	return tuple(key)


def sort_enrollments_for_enrollment_list(enrollments: list[Enrollment]) -> list[Enrollment]:
	def sort_key(enrollment: Enrollment) -> tuple[object, ...]:
		grade = getattr(enrollment, "grade", None)
		group = getattr(enrollment, "group", None)
		student = getattr(enrollment, "student", None)
		user = getattr(student, "user", None)

		grade_ordinal = getattr(grade, "ordinal", None)
		grade_ordinal_value = grade_ordinal if grade_ordinal is not None else 9999
		grade_name = (getattr(grade, "name", "") or "").strip().upper()
		group_name = (getattr(group, "name", "") or "").strip()

		last_name = (getattr(user, "last_name", "") or "").strip().upper()
		first_name = (getattr(user, "first_name", "") or "").strip().upper()
		user_id = getattr(user, "id", 0) or 0

		return (
			grade_ordinal_value,
			grade_name,
			_natural_sort_key(group_name),
			group_name.upper(),
			last_name,
			first_name,
			user_id,
		)

	items = list(enrollments)
	items.sort(key=sort_key)
	return items


def build_enrollment_list_report_context(*, year_id: int | None, grade_id: int | None, group_id: int | None) -> dict[str, Any]:
	enrollments_qs = (
		Enrollment.objects.select_related("student", "student__user", "grade", "group", "academic_year")
		.all()
	)

	year_name: str | int = "Todos"
	grade_name = ""
	group_name = ""

	if year_id is not None:
		enrollments_qs = enrollments_qs.filter(academic_year_id=year_id)
		try:
			year_name = AcademicYear.objects.get(pk=year_id).year
		except Exception:
			pass
	else:
		active_year = AcademicYear.objects.filter(status="ACTIVE").first()
		if active_year:
			enrollments_qs = enrollments_qs.filter(academic_year=active_year)
			year_name = active_year.year

	if grade_id is not None:
		enrollments_qs = enrollments_qs.filter(grade_id=grade_id)
		try:
			grade_name = Grade.objects.get(pk=grade_id).name
		except Exception:
			pass

	if group_id is not None:
		enrollments_qs = enrollments_qs.filter(group_id=group_id)
		try:
			group_name = Group.objects.get(pk=group_id).name
		except Exception:
			pass

	enrollments = sort_enrollments_for_enrollment_list(list(enrollments_qs))

	institution = Institution.objects.first() or Institution()

	return {
		"enrollments": enrollments,
		"institution": institution,
		"year_name": year_name,
		"grade_name": grade_name,
		"group_name": group_name,
	}
