from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Optional, Sequence, Tuple

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
