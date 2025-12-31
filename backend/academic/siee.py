from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Iterable, List, Mapping, Set


@dataclass(frozen=True)
class SIEEInputs:
    passing_score: Decimal
    # subject_id -> final_score
    subject_final_scores: Mapping[int, Decimal]
    # subject_id -> area_id
    subject_area_id: Mapping[int, int]


@dataclass(frozen=True)
class SIEEResult:
    decision: str
    failed_subject_ids: List[int]
    failed_area_ids: List[int]
    failed_subjects_distinct_areas_count: int


DECISION_PROMOTED = "PROMOTED"
DECISION_CONDITIONAL = "CONDITIONAL"
DECISION_REPEATED = "REPEATED"


def evaluate_promotion(inputs: SIEEInputs) -> SIEEResult:
    """Evaluates annual promotion according to the institution rules.

    Rules implemented (as provided):
    - Promoción plena: 0 áreas reprobadas AND 0 asignaturas reprobadas.
    - Promoción condicional: 1 área reprobada OR hasta 2 asignaturas reprobadas.
    - Repitencia: 2+ áreas reprobadas OR 3+ asignaturas reprobadas en diferentes áreas.

    Note: The ambiguous case "3 asignaturas reprobadas en una sola área" is treated as:
    - NOT triggering the 'different areas' clause (distinct areas count = 1).
    - Therefore it falls back to the area criteria (failed_areas_count will decide).
    """

    passing = Decimal(inputs.passing_score)

    failed_subject_ids: List[int] = []
    failed_area_ids_set: Set[int] = set()
    failed_subject_area_ids_set: Set[int] = set()

    for subject_id, score in inputs.subject_final_scores.items():
        if Decimal(score) < passing:
            failed_subject_ids.append(int(subject_id))
            area_id = inputs.subject_area_id.get(int(subject_id))
            if area_id is not None:
                failed_subject_area_ids_set.add(int(area_id))

    # 'Failed areas' is defined as areas that have at least one failed subject.
    # This matches the policy examples and supports mixed criteria.
    for area_id in failed_subject_area_ids_set:
        failed_area_ids_set.add(area_id)

    failed_areas_count = len(failed_area_ids_set)
    failed_subjects_count = len(failed_subject_ids)
    distinct_areas_count = len(failed_subject_area_ids_set)

    # Repitencia conditions
    if failed_areas_count >= 2:
        decision = DECISION_REPEATED
    elif failed_subjects_count >= 3 and distinct_areas_count >= 3:
        decision = DECISION_REPEATED
    # Promoción plena
    elif failed_areas_count == 0 and failed_subjects_count == 0:
        decision = DECISION_PROMOTED
    # Promoción condicional
    elif failed_areas_count == 1 or failed_subjects_count <= 2:
        decision = DECISION_CONDITIONAL
    else:
        # Fallback safety: any other case defaults to repeated
        decision = DECISION_REPEATED

    return SIEEResult(
        decision=decision,
        failed_subject_ids=sorted(failed_subject_ids),
        failed_area_ids=sorted(failed_area_ids_set),
        failed_subjects_distinct_areas_count=distinct_areas_count,
    )
