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

from .models import Commission, CommissionRuleConfig, CommissionStudentDecision, TeacherAssignment


@dataclass(frozen=True)
class CommissionDifficultyResult:
    enrollment_id: int
    failed_subjects_count: int
    failed_areas_count: int
    is_flagged: bool


@dataclass(frozen=True)
class CommissionDifficultySyncResult:
    created: int
    updated: int
    deleted: int
    summary: dict


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


def sync_commission_difficulties(commission: Commission) -> CommissionDifficultySyncResult:
    results = compute_difficulties_for_commission(commission)
    summary = summarize_difficulty_results(results)
    result_by_enrollment = {int(result.enrollment_id): result for result in results}

    existing = {
        int(decision.enrollment_id): decision
        for decision in CommissionStudentDecision.objects.select_for_update().filter(commission=commission)
    }

    created = 0
    updated = 0

    for enrollment_id, item in result_by_enrollment.items():
        decision = existing.get(enrollment_id)
        if decision is None:
            CommissionStudentDecision.objects.create(
                commission=commission,
                enrollment_id=enrollment_id,
                failed_subjects_count=int(item.failed_subjects_count),
                failed_areas_count=int(item.failed_areas_count),
                is_flagged=bool(item.is_flagged),
            )
            created += 1
            continue

        if (
            decision.failed_subjects_count == int(item.failed_subjects_count)
            and decision.failed_areas_count == int(item.failed_areas_count)
            and decision.is_flagged == bool(item.is_flagged)
        ):
            continue

        decision.failed_subjects_count = int(item.failed_subjects_count)
        decision.failed_areas_count = int(item.failed_areas_count)
        decision.is_flagged = bool(item.is_flagged)
        decision.save(update_fields=["failed_subjects_count", "failed_areas_count", "is_flagged", "updated_at"])
        updated += 1

    stale_ids = [
        int(decision.id)
        for enrollment_id, decision in existing.items()
        if enrollment_id not in result_by_enrollment
    ]
    deleted = 0
    if stale_ids:
        deleted, _ = CommissionStudentDecision.objects.filter(id__in=stale_ids).delete()

    return CommissionDifficultySyncResult(
        created=created,
        updated=updated,
        deleted=deleted,
        summary=summary,
    )
