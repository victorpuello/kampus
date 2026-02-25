from __future__ import annotations

import re
from typing import Any

from core.models import Institution

from academic.models import AcademicYear, Grade, Group
from .models import Enrollment, FamilyMember


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


def build_family_directory_by_group_report_context() -> dict[str, Any]:
	active_year = AcademicYear.objects.filter(status="ACTIVE").first()

	enrollments_qs = (
		Enrollment.objects.select_related("student", "student__user", "grade", "group", "academic_year")
		.filter(status="ACTIVE")
	)

	year_name: str | int = "Sin año activo"
	if active_year:
		enrollments_qs = enrollments_qs.filter(academic_year=active_year)
		year_name = active_year.year

	enrollments = sort_enrollments_for_enrollment_list(list(enrollments_qs))
	student_ids = [enrollment.student_id for enrollment in enrollments]

	family_members = (
		FamilyMember.objects.filter(student_id__in=student_ids)
		.order_by("student_id", "-is_main_guardian", "id")
	)
	guardian_by_student_id: dict[int, FamilyMember] = {}
	for family_member in family_members:
		if family_member.student_id not in guardian_by_student_id:
			guardian_by_student_id[family_member.student_id] = family_member

	rows: list[dict[str, Any]] = []
	for enrollment in enrollments:
		student = enrollment.student
		student_user = student.user
		student_name = ""
		if student_user is not None:
			student_name = (student_user.get_full_name() or "").strip()
		if not student_name:
			student_name = str(student)

		guardian = guardian_by_student_id.get(student.pk)
		rows.append(
			{
				"grade_ordinal": getattr(enrollment.grade, "ordinal", None),
				"grade_name": (getattr(enrollment.grade, "name", "") or "").strip(),
				"group_name": (getattr(enrollment.group, "name", "") or "").strip(),
				"student_name": student_name,
				"guardian_name": (guardian.full_name if guardian else "") or "",
				"guardian_document": (guardian.document_number if guardian else "") or "",
				"guardian_phone": (guardian.phone if guardian else "") or "",
				"guardian_address": (guardian.address if guardian else "") or "",
				"guardian_relationship": (guardian.relationship if guardian else "") or "",
			}
		)

	institution = Institution.objects.first() or Institution()

	return {
		"institution": institution,
		"year_name": year_name,
		"rows": rows,
	}
