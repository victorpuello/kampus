from __future__ import annotations

from collections import Counter
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List

from django.db.models import QuerySet

from academic.promotion import (
    PASSING_SCORE_DEFAULT,
    _compute_subject_final_for_enrollments,
    compute_promotions_for_year,
)
from students.models import Enrollment

from .models import Commission, CommissionRuleConfig, TeacherAssignment


@dataclass(frozen=True)
class CommissionDifficultyResult:
    enrollment_id: int
    failed_subjects_count: int
    failed_areas_count: int
    is_flagged: bool


def summarize_difficulty_results(results: List[CommissionDifficultyResult]) -> dict:
    total_students = len(results)
    total_flagged = sum(1 for item in results if item.is_flagged)
    total_not_flagged = total_students - total_flagged

    subjects_distribution = Counter(int(item.failed_subjects_count) for item in results)
    areas_distribution = Counter(int(item.failed_areas_count) for item in results)

    return {
        "total_students": total_students,
        "total_flagged": total_flagged,
        "total_not_flagged": total_not_flagged,
        "flagged_rate": round((total_flagged / total_students) * 100, 2) if total_students > 0 else 0.0,
        "subjects_distribution": dict(sorted(subjects_distribution.items())),
        "areas_distribution": dict(sorted(areas_distribution.items())),
    }


def _resolve_rule(commission: Commission) -> CommissionRuleConfig | None:
    qs = CommissionRuleConfig.objects.filter(
        academic_year_id=commission.academic_year_id,
        is_active=True,
    )
    if commission.institution_id:
        cfg = qs.filter(institution_id=commission.institution_id).first()
        if cfg is not None:
            return cfg
    return qs.filter(institution__isnull=True).first()


def _is_flagged(*, failed_subjects_count: int, failed_areas_count: int, operator: str, subjects_threshold: int, areas_threshold: int) -> bool:
    subjects_condition = failed_subjects_count >= int(subjects_threshold)
    areas_condition = failed_areas_count >= int(areas_threshold)

    if operator == CommissionRuleConfig.OPERATOR_AND:
        return subjects_condition and areas_condition

    return subjects_condition or areas_condition


def _build_enrollments_queryset(commission: Commission) -> QuerySet[Enrollment]:
    qs = Enrollment.objects.filter(
        academic_year_id=commission.academic_year_id,
        status="ACTIVE",
    ).select_related("student", "student__user", "group", "group__director")

    if commission.group_id:
        qs = qs.filter(group_id=commission.group_id)

    return qs


def compute_difficulties_for_commission(commission: Commission) -> List[CommissionDifficultyResult]:
    cfg = _resolve_rule(commission)

    subjects_threshold = int(getattr(cfg, "subjects_threshold", 2) or 2)
    areas_threshold = int(getattr(cfg, "areas_threshold", 2) or 2)
    operator = getattr(cfg, "operator", CommissionRuleConfig.OPERATOR_OR)

    enrollments = list(_build_enrollments_queryset(commission).only("id", "student_id", "group_id"))
    if not enrollments:
        return []

    if commission.commission_type == Commission.TYPE_PROMOTION:
        computed = compute_promotions_for_year(academic_year=commission.academic_year, passing_score=Decimal(PASSING_SCORE_DEFAULT))
        out: List[CommissionDifficultyResult] = []
        for enrollment in enrollments:
            comp = computed.get(int(enrollment.id))
            failed_subjects_count = len(getattr(comp, "failed_subject_ids", []) or [])
            failed_areas_count = len(getattr(comp, "failed_area_ids", []) or [])
            out.append(
                CommissionDifficultyResult(
                    enrollment_id=int(enrollment.id),
                    failed_subjects_count=failed_subjects_count,
                    failed_areas_count=failed_areas_count,
                    is_flagged=_is_flagged(
                        failed_subjects_count=failed_subjects_count,
                        failed_areas_count=failed_areas_count,
                        operator=operator,
                        subjects_threshold=subjects_threshold,
                        areas_threshold=areas_threshold,
                    ),
                )
            )
        return out

    if commission.period_id is None:
        return []

    enrollment_ids_by_group: Dict[int, List[int]] = defaultdict(list)
    for enrollment in enrollments:
        if enrollment.group_id:
            enrollment_ids_by_group[int(enrollment.group_id)].append(int(enrollment.id))

    failed_subject_ids_by_enrollment: Dict[int, set[int]] = defaultdict(set)
    failed_area_ids_by_enrollment: Dict[int, set[int]] = defaultdict(set)

    assignments = (
        TeacherAssignment.objects.filter(
            academic_year_id=commission.academic_year_id,
            academic_load__isnull=False,
            academic_load__subject__isnull=False,
        )
        .select_related("academic_load__subject__area")
        .only("id", "group_id", "academic_load__subject_id", "academic_load__subject__area_id")
    )
    if commission.group_id:
        assignments = assignments.filter(group_id=commission.group_id)

    passing_score = Decimal(PASSING_SCORE_DEFAULT)

    for assignment in assignments:
        group_enrollment_ids = enrollment_ids_by_group.get(int(assignment.group_id), [])
        if not group_enrollment_ids:
            continue

        finals = _compute_subject_final_for_enrollments(
            teacher_assignment=assignment,
            period=commission.period,
            enrollment_ids=group_enrollment_ids,
        )
        subject_id = int(assignment.academic_load.subject_id)
        area_id = int(assignment.academic_load.subject.area_id)

        for enrollment_id, score in finals.items():
            score_decimal = Decimal(score)
            if score_decimal < passing_score:
                failed_subject_ids_by_enrollment[int(enrollment_id)].add(subject_id)
                failed_area_ids_by_enrollment[int(enrollment_id)].add(area_id)

    out: List[CommissionDifficultyResult] = []
    for enrollment in enrollments:
        eid = int(enrollment.id)
        failed_subjects_count = len(failed_subject_ids_by_enrollment.get(eid, set()))
        failed_areas_count = len(failed_area_ids_by_enrollment.get(eid, set()))
        out.append(
            CommissionDifficultyResult(
                enrollment_id=eid,
                failed_subjects_count=failed_subjects_count,
                failed_areas_count=failed_areas_count,
                is_flagged=_is_flagged(
                    failed_subjects_count=failed_subjects_count,
                    failed_areas_count=failed_areas_count,
                    operator=operator,
                    subjects_threshold=subjects_threshold,
                    areas_threshold=areas_threshold,
                ),
            )
        )

    return out
