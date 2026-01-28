from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Iterable, List, Mapping, Optional, Tuple

from django.db import transaction

from .grading import DEFAULT_EMPTY_SCORE, final_grade_from_dimensions, weighted_average
from .models import (
    AcademicYear,
    Achievement,
    AchievementGrade,
    Dimension,
    GradeSheet,
    Period,
    TeacherAssignment,
)
from .siee import SIEEInputs, evaluate_promotion


PASSING_SCORE_DEFAULT = Decimal("3.00")


@dataclass(frozen=True)
class EnrollmentPromotionComputation:
    enrollment_id: int
    subject_finals: Dict[int, Decimal]
    subject_area_id: Dict[int, int]
    decision: str
    failed_subject_ids: List[int]
    failed_area_ids: List[int]
    failed_subjects_distinct_areas_count: int


def _get_periods_for_year(academic_year_id: int) -> List[Period]:
    return list(
        Period.objects.filter(academic_year_id=academic_year_id)
        .only("id", "is_closed")
        .order_by("start_date")
    )


def _achievement_queryset_for_assignment_period(teacher_assignment: TeacherAssignment, period: Period):
    base = Achievement.objects.filter(academic_load=teacher_assignment.academic_load, period=period)
    group_specific = base.filter(group=teacher_assignment.group)
    if group_specific.exists():
        return group_specific
    return base.filter(group__isnull=True)


def _compute_subject_final_for_enrollments(
    *,
    teacher_assignment: TeacherAssignment,
    period: Period,
    enrollment_ids: List[int],
) -> Dict[int, Decimal]:
    """Compute per-enrollment final for one subject (academic_load) in one period.

    Mirrors GradeSheetViewSet.gradebook logic (NULL => DEFAULT_EMPTY_SCORE).
    """

    achievements = (
        _achievement_queryset_for_assignment_period(teacher_assignment, period)
        .select_related("dimension")
        .order_by("id")
    )
    achievements = list(achievements)
    if not achievements or not enrollment_ids:
        return {enrollment_id: DEFAULT_EMPTY_SCORE for enrollment_id in enrollment_ids}

    achievements_by_dimension: Dict[int, List[Achievement]] = {}
    for a in achievements:
        if not a.dimension_id:
            continue
        achievements_by_dimension.setdefault(a.dimension_id, []).append(a)

    dim_ids = list(achievements_by_dimension.keys())
    dimensions = (
        Dimension.objects.filter(academic_year_id=teacher_assignment.academic_year_id, id__in=dim_ids)
        .only("id", "percentage")
        .order_by("id")
    )
    dim_percentage_by_id = {d.id: int(d.percentage) for d in dimensions}

    gradesheet = (
        GradeSheet.objects.filter(teacher_assignment=teacher_assignment, period=period)
        .only("id")
        .first()
    )
    score_by_cell: Dict[Tuple[int, int], Optional[Decimal]] = {}
    if gradesheet is not None:
        existing_grades = (
            AchievementGrade.objects.filter(
                gradesheet=gradesheet,
                enrollment_id__in=enrollment_ids,
                achievement_id__in=[a.id for a in achievements],
            )
            .only("enrollment_id", "achievement_id", "score")
        )
        score_by_cell = {(g.enrollment_id, g.achievement_id): g.score for g in existing_grades}

    finals: Dict[int, Decimal] = {}
    for enrollment_id in enrollment_ids:
        dim_items = []
        for dim_id, dim_achievements in achievements_by_dimension.items():
            items = [
                (
                    score_by_cell.get((enrollment_id, a.id)),
                    int(a.percentage) if a.percentage else 1,
                )
                for a in dim_achievements
            ]
            dim_grade = weighted_average(items) if items else DEFAULT_EMPTY_SCORE
            dim_items.append((dim_grade, dim_percentage_by_id.get(dim_id, 0)))

        finals[enrollment_id] = final_grade_from_dimensions(dim_items)

    return finals


def compute_promotions_for_year(
    *,
    academic_year: AcademicYear,
    passing_score: Decimal = PASSING_SCORE_DEFAULT,
) -> Dict[int, EnrollmentPromotionComputation]:
    """Compute annual promotion decisions for ACTIVE enrollments in the given year.

    Returns mapping: enrollment_id -> computation details.
    """

    periods = _get_periods_for_year(academic_year.id)

    from students.models import Enrollment

    enrollments = (
        Enrollment.objects.filter(academic_year_id=academic_year.id, status="ACTIVE")
        .select_related("group", "grade", "grade__level")
        .only("id", "group_id", "grade_id", "grade__level__level_type")
    )

    enrollment_ids = [e.id for e in enrollments]
    group_id_by_enrollment = {e.id: e.group_id for e in enrollments}
    grade_level_type_by_enrollment = {e.id: (e.grade.level.level_type if e.grade and e.grade.level else None) for e in enrollments}

    if any(group_id_by_enrollment[eid] is None for eid in enrollment_ids):
        missing = [eid for eid in enrollment_ids if group_id_by_enrollment[eid] is None]
        raise ValueError(
            f"Hay matrículas activas sin grupo asignado: {missing[:20]}" + ("..." if len(missing) > 20 else "")
        )

    # Prepare accumulators: enrollment -> subject -> (sum, count)
    subject_sum: Dict[Tuple[int, int], Decimal] = defaultdict(lambda: Decimal("0.00"))
    subject_count: Dict[Tuple[int, int], int] = defaultdict(int)
    subject_area_id: Dict[int, int] = {}

    assignments = (
        TeacherAssignment.objects.filter(academic_year_id=academic_year.id)
        .select_related("group", "academic_load__subject__area")
        .only(
            "id",
            "group_id",
            "academic_year_id",
            "academic_load_id",
            "academic_load__subject_id",
            "academic_load__subject__area_id",
        )
    )

    # Group enrollments by group for efficient loops
    enrollment_ids_by_group: Dict[int, List[int]] = defaultdict(list)
    for enrollment_id, group_id in group_id_by_enrollment.items():
        enrollment_ids_by_group[int(group_id)].append(int(enrollment_id))

    for ta in assignments:
        if not ta.academic_load_id:
            continue
        subj_id = int(ta.academic_load.subject_id)
        area_id = int(ta.academic_load.subject.area_id)
        subject_area_id[subj_id] = area_id

        group_enrollment_ids = enrollment_ids_by_group.get(int(ta.group_id), [])
        if not group_enrollment_ids:
            continue

        for period in periods:
            finals = _compute_subject_final_for_enrollments(
                teacher_assignment=ta,
                period=period,
                enrollment_ids=group_enrollment_ids,
            )
            for enrollment_id, final_score in finals.items():
                key = (int(enrollment_id), subj_id)
                subject_sum[key] += Decimal(final_score)
                subject_count[key] += 1

    result: Dict[int, EnrollmentPromotionComputation] = {}

    for enrollment in enrollments:
        eid = int(enrollment.id)
        level_type = grade_level_type_by_enrollment.get(eid)

        # Build subject finals for this enrollment
        finals_by_subject: Dict[int, Decimal] = {}
        for (enrollment_id, subject_id), total in subject_sum.items():
            if enrollment_id != eid:
                continue
            count = subject_count.get((enrollment_id, subject_id), 0)
            if count <= 0:
                continue
            finals_by_subject[int(subject_id)] = (total / Decimal(count)).quantize(Decimal("0.01"))

        # Preescolar: promoción automática (pasan al siguiente grado)
        if level_type == "PRESCHOOL":
            decision = "PROMOTED"
            failed_subject_ids: List[int] = []
            failed_area_ids: List[int] = []
            distinct_areas_count = 0
        else:
            siee_result = evaluate_promotion(
                SIEEInputs(
                    passing_score=Decimal(passing_score),
                    subject_final_scores=finals_by_subject,
                    subject_area_id=subject_area_id,
                )
            )
            decision = siee_result.decision
            failed_subject_ids = siee_result.failed_subject_ids
            failed_area_ids = siee_result.failed_area_ids
            distinct_areas_count = siee_result.failed_subjects_distinct_areas_count

        result[eid] = EnrollmentPromotionComputation(
            enrollment_id=eid,
            subject_finals=finals_by_subject,
            subject_area_id=subject_area_id,
            decision=decision,
            failed_subject_ids=failed_subject_ids,
            failed_area_ids=failed_area_ids,
            failed_subjects_distinct_areas_count=distinct_areas_count,
        )

    return result
