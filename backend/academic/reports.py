from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from academic.promotion import PASSING_SCORE_DEFAULT, _compute_subject_final_for_enrollments, compute_promotions_for_year
from academic.models import Group, Period, TeacherAssignment
from core.models import Institution
from discipline.models import DisciplineCase
from students.models import Enrollment, FamilyMember, ObserverAnnotation

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

def build_commission_group_acta_context(
	*,
	commission: Commission,
	generated_by,
	ai_blocks: dict[str, Any] | None = None,
) -> dict[str, Any]:
	def _subject_code(subject_name: str) -> str:
		name = (subject_name or "").strip().upper()
		if not name:
			return "N/A"
		mapping = {
			"MATEMATICAS": "MATE",
			"MATEMÁTICAS": "MATE",
			"QUIMICA": "QUIM",
			"QUÍMICA": "QUIM",
			"INGLES": "INGL",
			"INGLÉS": "INGL",
			"LENGUA CASTELLANA": "LENG",
			"LENGUAJE": "LENG",
			"FILOSOFIA": "FILO",
			"FILOSOFÍA": "FILO",
			"FISICA": "FISI",
			"FÍSICA": "FISI",
			"SOCIALES": "SOCI",
			"TECNOLOGIA": "TECN",
			"TECNOLOGÍA": "TECN",
			"ARTISTICA": "ARTI",
			"ARTÍSTICA": "ARTI",
			"BIOLOGIA": "BIOL",
			"BIOLOGÍA": "BIOL",
		}
		for key, value in mapping.items():
			if key in name:
				return value
		clean = "".join(ch for ch in name if ch.isalpha())
		return (clean[:4] or "N/A").ljust(4, "X")[:4]

	group = commission.group
	campus = getattr(group, "campus", None) if group else None
	institution = getattr(campus, "institution", None) if campus else None
	if institution is None:
		institution = commission.institution or Institution.objects.first() or Institution(name="")

	enrollments = list(
		Enrollment.objects.select_related("student", "student__user", "group", "grade")
		.filter(
			academic_year_id=commission.academic_year_id,
			group_id=getattr(group, "id", None),
			status="ACTIVE",
		)
		.order_by("student__user__last_name", "student__user__first_name")
	)
	enrollment_ids = [int(item.id) for item in enrollments]

	passing_score = Decimal(PASSING_SCORE_DEFAULT)
	scores_by_enrollment: dict[int, list[Decimal]] = {int(item.id): [] for item in enrollments}
	failed_subject_ids_by_enrollment: dict[int, set[int]] = {int(item.id): set() for item in enrollments}

	if commission.commission_type == Commission.TYPE_EVALUATION and commission.period_id and enrollment_ids:
		assignments = (
			TeacherAssignment.objects.filter(
				academic_year_id=commission.academic_year_id,
				group_id=getattr(group, "id", None),
				academic_load__subject__isnull=False,
			)
			.select_related("academic_load", "academic_load__subject")
			.only("id", "academic_load__subject_id")
		)
		for assignment in assignments:
			subject_id = int(getattr(assignment.academic_load, "subject_id", 0) or 0)
			if not subject_id:
				continue
			finals = _compute_subject_final_for_enrollments(
				teacher_assignment=assignment,
				period=commission.period,
				enrollment_ids=enrollment_ids,
			)
			for enrollment_id, score in finals.items():
				if enrollment_id not in scores_by_enrollment:
					continue
				if score is None:
					continue
				try:
					score_decimal = Decimal(str(score))
				except Exception:
					continue
				scores_by_enrollment[enrollment_id].append(score_decimal)
				if score_decimal < passing_score:
					failed_subject_ids_by_enrollment[enrollment_id].add(subject_id)

	all_failed_subject_ids = {
		subject_id
		for subject_ids in failed_subject_ids_by_enrollment.values()
		for subject_id in subject_ids
	}
	subject_names_by_id = {
		int(row["id"]): str(row["name"])
		for row in Subject.objects.filter(id__in=all_failed_subject_ids).values("id", "name")
	}

	low_rows: list[dict[str, Any]] = []
	for enrollment in enrollments:
		enrollment_id = int(enrollment.id)
		failed_ids = sorted(failed_subject_ids_by_enrollment.get(enrollment_id, set()))
		if not failed_ids:
			continue
		subject_names = [subject_names_by_id.get(subject_id, "Sin detalle") for subject_id in failed_ids]
		low_rows.append(
			{
				"enrollment_id": enrollment_id,
				"student_name": enrollment.student.user.get_full_name().upper(),
				"subjects": subject_names,
				"subject_codes": [_subject_code(subject_name) for subject_name in subject_names],
				"failed_count": len(failed_ids),
			}
		)

	low_rows.sort(key=lambda item: (-int(item.get("failed_count", 0)), str(item.get("student_name", ""))))
	low_performance_students: list[dict[str, Any]] = [
		{
			"index": index,
			"student_name": item["student_name"],
			"subjects": item["subjects"],
			"subject_codes": item["subject_codes"],
			"status_label": "Reportado",
		}
		for index, item in enumerate(low_rows, start=1)
	]

	best_candidates: list[dict[str, Any]] = []
	for enrollment in enrollments:
		enrollment_id = int(enrollment.id)
		scores = scores_by_enrollment.get(enrollment_id, [])
		if not scores:
			continue
		average = sum(scores) / Decimal(len(scores))
		failed_count = len(failed_subject_ids_by_enrollment.get(enrollment_id, set()))
		best_candidates.append(
			{
				"student_name": enrollment.student.user.get_full_name().upper(),
				"average": average,
				"failed_count": failed_count,
			}
		)

	best_candidates.sort(key=lambda item: (-item["average"], item["failed_count"], item["student_name"]))
	best_performance_students: list[dict[str, Any]] = []
	for item in best_candidates:
		if len(best_performance_students) >= 2:
			break
		average_value = item["average"]
		average_label = f"{average_value.quantize(Decimal('0.1'))}"
		highlight = "Desempeño académico destacado durante el periodo."
		if average_value >= Decimal("4.6"):
			highlight = "Rendimiento superior y compromiso académico constante."
		elif average_value >= Decimal("4.0"):
			highlight = "Desempeño alto con cumplimiento sostenido en las áreas evaluadas."
		best_performance_students.append(
			{
				"index": len(best_performance_students) + 1,
				"student_name": item["student_name"],
				"highlight": highlight,
				"average_label": average_label,
			}
		)

	student_ids = [int(item.student_id) for item in enrollments]
	annotations_qs = ObserverAnnotation.objects.select_related("student", "student__user").filter(
		is_deleted=False,
		student_id__in=student_ids,
		annotation_type__in=[ObserverAnnotation.TYPE_ALERT, ObserverAnnotation.TYPE_OBSERVATION],
	)
	if commission.period_id:
		annotations_qs = annotations_qs.filter(
			Q(period_id=commission.period_id)
			| Q(
				period__isnull=True,
				created_at__date__gte=commission.period.start_date,
				created_at__date__lte=commission.period.end_date,
			)
		)

	annotations = list(annotations_qs.order_by("student_id", "-created_at"))
	minimum_discipline_annotations = 1
	discipline_summary: dict[int, dict[str, Any]] = {}
	for annotation in annotations:
		student_id = int(annotation.student_id)
		bucket = discipline_summary.setdefault(
			student_id,
			{
				"count": 0,
				"latest_text": "",
				"latest_at": None,
				"student_name": annotation.student.user.get_full_name().upper(),
			},
		)
		bucket["count"] += 1
		annotation_text = (annotation.text or annotation.title or "").strip() or "Presenta anotaciones disciplinarias durante el periodo."
		annotation_at = timezone.localtime(annotation.created_at)
		latest_at = bucket.get("latest_at")
		if latest_at is None or annotation_at >= latest_at:
			bucket["latest_at"] = annotation_at
			bucket["latest_text"] = annotation_text

	cases_qs = DisciplineCase.objects.select_related("student", "student__user", "enrollment").filter(
		student_id__in=student_ids,
		enrollment__academic_year_id=commission.academic_year_id,
		enrollment__group_id=group.id,
	)
	if commission.period_id:
		cases_qs = cases_qs.filter(
			occurred_at__date__gte=commission.period.start_date,
			occurred_at__date__lte=commission.period.end_date,
		)

	for case in cases_qs.order_by("student_id", "-occurred_at"):
		student_id = int(case.student_id)
		bucket = discipline_summary.setdefault(
			student_id,
			{
				"count": 0,
				"latest_text": "",
				"latest_at": None,
				"student_name": case.student.user.get_full_name().upper(),
			},
		)
		bucket["count"] += 1
		case_text = (case.narrative or "").strip() or "Caso disciplinario registrado durante el periodo."
		case_at = timezone.localtime(case.occurred_at)
		latest_at = bucket.get("latest_at")
		if latest_at is None or case_at >= latest_at:
			bucket["latest_at"] = case_at
			bucket["latest_text"] = case_text

	discipline_students: list[dict[str, Any]] = []
	for data in discipline_summary.values():
		count = int(data.get("count", 0))
		if count < minimum_discipline_annotations:
			continue
		level = "TIPO I"
		if count >= 5:
			level = "TIPO III"
		elif count >= 3:
			level = "TIPO II"
		discipline_students.append(
			{
				"student_name": data.get("student_name", ""),
				"observation": str(data.get("latest_text", "")).strip(),
				"level": level,
				"count": count,
			}
		)

	discipline_students.sort(key=lambda item: (-int(item.get("count", 0)), str(item.get("student_name", ""))))
	discipline_students = [
		{
			"index": index,
			"student_name": item["student_name"],
			"observation": item["observation"],
			"level": item["level"],
		}
		for index, item in enumerate(discipline_students[:10], start=1)
	]

	total_students = len(enrollments)
	flagged_count = len(low_performance_students)
	promoted_count = max(0, total_students - flagged_count)
	pending_count = 0
	reprobated_count = flagged_count

	rector_user = getattr(institution, "rector", None)
	director_user = getattr(group, "director", None) if group else None

	attendees: list[dict[str, str]] = []
	if rector_user is not None:
		attendees.append({
			"name": (rector_user.get_full_name() or rector_user.username or "").strip(),
			"role": "Rector",
		})
	if director_user is not None:
		attendees.append({
			"name": (director_user.get_full_name() or director_user.username or "").strip(),
			"role": "Director(a) de Grupo",
		})
	if generated_by is not None:
		attendees.append({
			"name": (generated_by.get_full_name() or generated_by.username or "").strip(),
			"role": "Coordinación Académica",
		})

	meeting_date = timezone.localtime(timezone.now())
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

	grade_name = getattr(getattr(group, "grade", None), "name", "") if group else ""
	group_name = getattr(group, "name", "") if group else ""
	grade_group_label = f"{grade_name} ({group_name})" if grade_name and group_name else (grade_name or group_name or "General")
	period_name = getattr(getattr(commission, "period", None), "name", "") if commission.period_id else "Cierre anual"

	period_name_clean = (period_name or "").strip().lower()
	period_legal_phrase = "periodo académico"
	if period_name_clean in {"p1", "periodo 1", "primer periodo", "periodo primero", "periodo primer periodo"}:
		period_legal_phrase = "primer periodo académico"
	elif period_name_clean in {"p2", "periodo 2", "segundo periodo", "periodo segundo"}:
		period_legal_phrase = "segundo periodo académico"
	elif period_name_clean in {"p3", "periodo 3", "tercer periodo", "periodo tercero"}:
		period_legal_phrase = "tercer periodo académico"
	elif period_name_clean in {"p4", "periodo 4", "cuarto periodo", "periodo cuarto"}:
		period_legal_phrase = "cuarto periodo académico"
	elif period_name_clean and period_name_clean != "cierre anual":
		period_legal_phrase = f"periodo {period_name_clean}"

	ai_blocks = ai_blocks or {}
	executive_summary = str(ai_blocks.get("executive_summary") or "").strip()
	general_observations = ai_blocks.get("general_observations") or []
	agreed_commitments = ai_blocks.get("agreed_commitments") or ai_blocks.get("institutional_commitments") or []
	if not executive_summary:
		executive_summary = (
			"La comisión revisó el desempeño del grupo, priorizó los casos con bajo rendimiento y acordó acciones "
			"de acompañamiento académico para fortalecer el logro de competencias en el siguiente periodo."
		)
	if not isinstance(general_observations, list) or not general_observations:
		general_observations = [
			"Fortalecer procesos de acompañamiento pedagógico y planes de mejora individual.",
			"Seguimiento continuo por parte de dirección de grupo y orientación escolar.",
			"Remitir al comité de apoyo pedagógico casos con riesgo académico sostenido.",
		]
	if not isinstance(agreed_commitments, list) or not agreed_commitments:
		agreed_commitments = [
			"Docentes: diseñar e implementar estrategias remediales por área priorizada.",
			"Directores de grupo: seguimiento personalizado a estudiantes con bajo rendimiento.",
			"Familia: asistencia obligatoria a reuniones de seguimiento y control de tareas.",
		]

	commission_is_evaluation = commission.commission_type == Commission.TYPE_EVALUATION
	meeting_place = "Sala de Informática"

	return {
		"institution": institution,
		"commission": commission,
		"commission_type": commission.commission_type,
		"commission_is_evaluation": commission_is_evaluation,
		"academic_year": getattr(getattr(commission, "academic_year", None), "year", ""),
		"period_name": period_name,
		"period_legal_phrase": period_legal_phrase,
		"grade_name": grade_name,
		"acta_number": f"{commission.id:03d}-{getattr(getattr(commission, 'academic_year', None), 'year', '')}",
		"grade_group_label": grade_group_label,
		"meeting_day": meeting_date.day,
		"meeting_month_name": month_name,
		"meeting_year": meeting_date.year,
		"meeting_hour": meeting_date.strftime("%I:%M %p"),
		"meeting_place": meeting_place,
		"attendees": [a for a in attendees if a.get("name")],
		"total_students": total_students,
		"promoted_count": promoted_count,
		"pending_count": pending_count,
		"reprobated_count": reprobated_count,
		"flagged_count": flagged_count,
		"cases": low_performance_students,
		"low_performance_students": low_performance_students,
		"best_performance_students": best_performance_students,
		"discipline_students": discipline_students,
		"executive_summary": executive_summary,
		"general_observations": [str(item).strip() for item in general_observations if str(item).strip()],
		"agreed_commitments": [str(item).strip() for item in agreed_commitments if str(item).strip()],
		"institutional_commitments": [str(item).strip() for item in agreed_commitments if str(item).strip()],
		"closing_text": (
			f"Siendo las {meeting_date.strftime('%I:%M %p')} se da por terminada la sesión y firman quienes en ella intervinieron."
		),
	}
