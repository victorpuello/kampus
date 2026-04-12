from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping, Optional, Sequence, Tuple

from .models import EvaluationScale

DEFAULT_EMPTY_SCORE = Decimal("1.00")
MIN_SCORE = Decimal("1.00")
MAX_SCORE = Decimal("5.00")


def coalesce_score(score: Optional[Decimal]) -> Decimal:
    return DEFAULT_EMPTY_SCORE if score is None else Decimal(score)


def weighted_average(
    items: Sequence[Tuple[Optional[Decimal], Optional[int]]],
) -> Decimal:
    if not items:
        return DEFAULT_EMPTY_SCORE

    weights = [int(w) if w else 1 for _, w in items]
    total_weight = sum(weights)
    if total_weight <= 0:
        return DEFAULT_EMPTY_SCORE

    total = sum(coalesce_score(score) * Decimal(weight) for (score, _), weight in zip(items, weights))
    return (total / Decimal(total_weight)).quantize(Decimal("0.01"))


def final_grade_from_dimensions(
    dimension_items: Sequence[Tuple[Decimal, int]],
) -> Decimal:
    if not dimension_items:
        return DEFAULT_EMPTY_SCORE

    total_percentage = sum(int(p) for _, p in dimension_items)
    if total_percentage <= 0:
        return DEFAULT_EMPTY_SCORE

    total = sum(grade * Decimal(int(p)) for grade, p in dimension_items)
    return (total / Decimal(total_percentage)).quantize(Decimal("0.01"))


def final_grade_from_achievement_scores(
    achievement_scores: Sequence[Tuple[Optional[int], Optional[int], Optional[Decimal]]],
    *,
    dimension_percentage_by_id: Mapping[int, int],
) -> Decimal:
    grouped_scores: dict[int, list[Tuple[Optional[Decimal], int]]] = {}
    for dimension_id, achievement_percentage, score in achievement_scores:
        if not dimension_id:
            continue
        grouped_scores.setdefault(int(dimension_id), []).append(
            (score, int(achievement_percentage) if achievement_percentage else 1)
        )

    dim_items = [
        (
            weighted_average(items) if items else DEFAULT_EMPTY_SCORE,
            int(dimension_percentage_by_id.get(dim_id, 0) or 0),
        )
        for dim_id, items in grouped_scores.items()
    ]
    return final_grade_from_dimensions(dim_items)


@dataclass(frozen=True)
class EvaluationScaleMatch:
    name: str
    description: str


def match_scale(academic_year_id: int, score: Decimal) -> Optional[EvaluationScaleMatch]:
    scale = (
        EvaluationScale.objects.filter(
            academic_year_id=academic_year_id,
            min_score__lte=score,
            max_score__gte=score,
        )
        .order_by("min_score")
        .first()
    )
    if not scale:
        return None
    return EvaluationScaleMatch(name=scale.name, description=scale.description)


def achievement_queryset_for_assignment_period(teacher_assignment, period):
    """Fuente única de verdad: achievements de grupo específico si existen; globales si no.

    Todos los módulos que calculan la nota definitiva (gradebook, boletín, sábana,
    comisión) deben usar esta función para seleccionar los achievements válidos de un
    (teacher_assignment, period).
    """
    from .models import Achievement

    base = Achievement.objects.filter(
        academic_load=teacher_assignment.academic_load,
        period=period,
    )
    group_specific = base.filter(group=teacher_assignment.group)
    if group_specific.exists():
        return group_specific
    return base.filter(group__isnull=True)
