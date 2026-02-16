from __future__ import annotations

from collections import Counter
from typing import Any

from students.models import Enrollment

from .models import (
    AcademicLoad,
    Achievement,
    AchievementGrade,
    Commission,
    GradeSheet,
    Group,
    Period,
    TeacherAssignment,
)


REASON_PERIOD_NOT_CLOSED = "PERIOD_NOT_CLOSED"
REASON_OPEN_PERIODS_FOR_PROMOTION = "OPEN_PERIODS_FOR_PROMOTION"
REASON_MISSING_TEACHER_ASSIGNMENT = "MISSING_TEACHER_ASSIGNMENT"
REASON_MISSING_ACHIEVEMENTS = "MISSING_ACHIEVEMENTS"
REASON_MISSING_GRADEBOOK = "MISSING_GRADEBOOK"
REASON_INCOMPLETE_GRADEBOOK = "INCOMPLETE_GRADEBOOK"


def _teacher_name(assignment: TeacherAssignment | None) -> str:
    if assignment is None or assignment.teacher_id is None:
        return ""
    full_name = assignment.teacher.get_full_name().strip()
    return full_name or assignment.teacher.username


def _resolve_assignment_achievements(assignment: TeacherAssignment, period: Period):
    base_qs = Achievement.objects.filter(
        academic_load_id=assignment.academic_load_id,
        period_id=period.id,
    )
    group_qs = base_qs.filter(group_id=assignment.group_id)
    if group_qs.exists():
        return group_qs
    return base_qs.filter(group__isnull=True)


def _is_preschool_group(group: Group) -> bool:
    level = getattr(getattr(group, "grade", None), "level", None)
    return getattr(level, "level_type", "") == "PRESCHOOL"


def _build_item(
    *,
    reason_code: str,
    reason_message: str,
    action_hint: str,
    group: Group | None = None,
    period: Period | None = None,
    subject_name: str = "",
    teacher_name: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "reason_code": reason_code,
        "reason_message": reason_message,
        "action_hint": action_hint,
        "group_id": int(group.id) if group is not None else None,
        "group_name": group.name if group is not None else "",
        "period_id": int(period.id) if period is not None else None,
        "period_name": period.name if period is not None else "",
        "subject_name": subject_name,
        "teacher_name": teacher_name,
    }
    if meta:
        payload["meta"] = meta
    return payload


def evaluate_commission_preconditions(
    *,
    commission_type: str,
    academic_year_id: int,
    period: Period | None,
    group: Group | None,
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []

    periods_to_validate: list[Period] = []
    if commission_type == Commission.TYPE_EVALUATION:
        if period is not None:
            periods_to_validate = [period]
            if not period.is_closed:
                items.append(
                    _build_item(
                        reason_code=REASON_PERIOD_NOT_CLOSED,
                        reason_message="El periodo seleccionado no está cerrado.",
                        action_hint="Cierra el periodo para permitir la creación de la comisión.",
                        period=period,
                    )
                )
    elif commission_type == Commission.TYPE_PROMOTION:
        periods_to_validate = list(
            Period.objects.filter(academic_year_id=academic_year_id).order_by("start_date", "id")
        )
        open_periods = [current_period for current_period in periods_to_validate if not current_period.is_closed]
        for open_period in open_periods:
            items.append(
                _build_item(
                    reason_code=REASON_OPEN_PERIODS_FOR_PROMOTION,
                    reason_message="La promoción requiere todos los periodos del año cerrados.",
                    action_hint="Cierra todos los periodos pendientes antes de crear la comisión de promoción.",
                    period=open_period,
                )
            )

    groups_qs = Group.objects.filter(academic_year_id=academic_year_id).select_related("grade", "grade__level")
    if group is not None:
        groups_qs = groups_qs.filter(id=group.id)
    groups = list(groups_qs)

    if not groups or not periods_to_validate:
        counts = Counter(item["reason_code"] for item in items)
        return {
            "code": "COMMISSION_PRECONDITION_FAILED",
            "message": "No se puede crear la comisión porque existen prerequisitos incumplidos.",
            "blocking_items": items,
            "summary": {
                "total_groups_evaluated": len(groups),
                "total_blocking_items": len(items),
                "reasons_count": dict(counts),
            },
        }

    group_ids = [int(current_group.id) for current_group in groups]
    grade_ids = list({int(current_group.grade_id) for current_group in groups if current_group.grade_id})

    loads_by_grade: dict[int, list[AcademicLoad]] = {}
    for current_load in (
        AcademicLoad.objects.filter(grade_id__in=grade_ids)
        .select_related("subject")
        .order_by("subject__name", "id")
    ):
        loads_by_grade.setdefault(int(current_load.grade_id), []).append(current_load)

    assignments = list(
        TeacherAssignment.objects.filter(
            academic_year_id=academic_year_id,
            group_id__in=group_ids,
            academic_load_id__isnull=False,
        )
        .select_related("teacher", "academic_load", "academic_load__subject", "group")
        .only(
            "id",
            "group_id",
            "teacher_id",
            "teacher__first_name",
            "teacher__last_name",
            "teacher__username",
            "academic_load_id",
            "academic_load__subject_id",
            "academic_load__subject__name",
        )
    )
    assignment_by_group_load = {
        (int(assignment.group_id), int(assignment.academic_load_id)): assignment
        for assignment in assignments
    }

    active_enrollments = list(
        Enrollment.objects.filter(
            academic_year_id=academic_year_id,
            group_id__in=group_ids,
            status="ACTIVE",
        ).only("id", "group_id")
    )
    enrollment_ids_by_group: dict[int, list[int]] = {}
    for enrollment in active_enrollments:
        enrollment_ids_by_group.setdefault(int(enrollment.group_id), []).append(int(enrollment.id))

    for current_group in groups:
        current_group_enrollment_ids = enrollment_ids_by_group.get(int(current_group.id), [])
        if not current_group_enrollment_ids:
            continue

        for current_load in loads_by_grade.get(int(current_group.grade_id), []):
            current_assignment = assignment_by_group_load.get((int(current_group.id), int(current_load.id)))
            subject_name = current_load.subject.name

            if current_assignment is None:
                items.append(
                    _build_item(
                        reason_code=REASON_MISSING_TEACHER_ASSIGNMENT,
                        reason_message="No hay docente asignado para la asignatura en este grupo.",
                        action_hint="Asigna un docente en la carga académica del grupo.",
                        group=current_group,
                        subject_name=subject_name,
                    )
                )
                continue

            teacher_name = _teacher_name(current_assignment)
            for current_period in periods_to_validate:
                achievements_qs = _resolve_assignment_achievements(current_assignment, current_period)
                achievement_ids = list(achievements_qs.values_list("id", flat=True))

                if not achievement_ids:
                    items.append(
                        _build_item(
                            reason_code=REASON_MISSING_ACHIEVEMENTS,
                            reason_message="No hay logros configurados para la asignatura en el periodo.",
                            action_hint="Configura los logros del periodo para esta asignatura.",
                            group=current_group,
                            period=current_period,
                            subject_name=subject_name,
                            teacher_name=teacher_name,
                        )
                    )
                    continue

                grade_sheet_id = (
                    GradeSheet.objects.filter(
                        teacher_assignment_id=current_assignment.id,
                        period_id=current_period.id,
                    )
                    .values_list("id", flat=True)
                    .first()
                )
                if not grade_sheet_id:
                    items.append(
                        _build_item(
                            reason_code=REASON_MISSING_GRADEBOOK,
                            reason_message="La planilla de notas no ha sido creada para el periodo.",
                            action_hint="Crea y diligencia la planilla de notas del periodo.",
                            group=current_group,
                            period=current_period,
                            subject_name=subject_name,
                            teacher_name=teacher_name,
                        )
                    )
                    continue

                total_cells = len(current_group_enrollment_ids) * len(achievement_ids)
                if total_cells <= 0:
                    continue

                is_preschool = _is_preschool_group(current_group)
                grade_filter: dict[str, Any] = {
                    "gradesheet_id": grade_sheet_id,
                    "enrollment_id__in": current_group_enrollment_ids,
                    "achievement_id__in": achievement_ids,
                }
                if is_preschool:
                    grade_filter["qualitative_scale__isnull"] = False
                else:
                    grade_filter["score__isnull"] = False

                filled_cells = AchievementGrade.objects.filter(**grade_filter).only("id").count()
                if filled_cells < total_cells:
                    items.append(
                        _build_item(
                            reason_code=REASON_INCOMPLETE_GRADEBOOK,
                            reason_message="La planilla existe pero está incompleta.",
                            action_hint="Completa los registros pendientes en la planilla del periodo.",
                            group=current_group,
                            period=current_period,
                            subject_name=subject_name,
                            teacher_name=teacher_name,
                            meta={"filled": int(filled_cells), "total": int(total_cells)},
                        )
                    )

    counts = Counter(item["reason_code"] for item in items)
    return {
        "code": "COMMISSION_PRECONDITION_FAILED",
        "message": "No se puede crear la comisión porque existen prerequisitos incumplidos.",
        "blocking_items": items,
        "summary": {
            "total_groups_evaluated": len(groups),
            "total_blocking_items": len(items),
            "reasons_count": dict(counts),
        },
    }
