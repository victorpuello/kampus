from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.conf import settings
from django.template.loader import render_to_string

from academic.grading import DEFAULT_EMPTY_SCORE, final_grade_from_dimensions, match_scale, weighted_average
from academic.models import (
    Achievement,
    AchievementGrade,
    Dimension,
    EvaluationScale,
    GradeSheet,
    Period,
    PerformanceIndicator,
    TeacherAssignment,
)
from core.models import Institution
from students.models import Enrollment

from reports.weasyprint_utils import render_pdf_bytes_from_html


def _group_label(group: Any) -> str:
    if not group:
        return ""
    grade = getattr(group, "grade", None)
    grade_name = getattr(grade, "name", "") or str(grade) if grade else ""
    group_name = getattr(group, "name", "") or ""
    return " ".join([p for p in [grade_name.strip(), group_name.strip()] if p])


def _shift_label(group: Any) -> str:
    if not group:
        return ""
    get_display = getattr(group, "get_shift_display", None)
    if callable(get_display):
        return get_display() or ""
    return getattr(group, "shift", "") or ""


def _format_score(score: Optional[Decimal]) -> str:
    if score is None:
        return ""
    try:
        return f"{Decimal(score):.2f}"
    except Exception:
        return str(score)


def _scale_name(academic_year_id: int, score: Optional[Decimal]) -> str:
    if score is None:
        return ""
    match = match_scale(academic_year_id, Decimal(score))
    return match.name if match else ""


def _indicator_level_from_scale_name(scale_name: str) -> Optional[str]:
    """Map EvaluationScale.name (human string) to PerformanceIndicator.level."""
    if not scale_name:
        return None
    s = scale_name.strip().lower()
    if "super" in s:
        return "SUPERIOR"
    if "alto" in s:
        return "HIGH"
    if "basi" in s:
        return "BASIC"
    if "bajo" in s:
        return "LOW"
    return None


def _year_periods(academic_year_id: int) -> List[Period]:
    year_periods = list(
        Period.objects.filter(academic_year_id=academic_year_id)
        .only("id", "name", "start_date", "end_date")
        .order_by("start_date", "id")
    )
    return year_periods[:4]


def _scale_equivalences(academic_year_id: int) -> str:
    scale_parts: List[str] = []
    scales = (
        EvaluationScale.objects.filter(academic_year_id=academic_year_id)
        .only("name", "min_score", "max_score")
        .order_by("min_score")
    )
    for s in scales:
        if s.min_score is None or s.max_score is None:
            continue
        scale_parts.append(f"{s.name}: {Decimal(s.min_score):.2f} - {Decimal(s.max_score):.2f}")
    return ", ".join(scale_parts) if scale_parts else ""


def _compute_overall_from_rows(academic_year_id: int, rows: List[Dict[str, Any]]) -> Tuple[str, str]:
    scores: List[Decimal] = []
    for r in rows:
        if (r.get("row_type") or "").upper() != "SUBJECT":
            continue
        raw = (r.get("final_score") or "").strip()
        if not raw:
            continue
        try:
            scores.append(Decimal(raw))
        except Exception:
            continue

    if not scores:
        return "", ""

    avg = (sum(scores) / Decimal(len(scores))).quantize(Decimal("0.01"))
    return _format_score(avg), _scale_name(academic_year_id, avg)


def _overall_decimal_from_rows(rows: List[Dict[str, Any]]) -> Optional[Decimal]:
    scores: List[Decimal] = []
    for r in rows:
        if (r.get("row_type") or "").upper() != "SUBJECT":
            continue
        raw = (r.get("final_score") or "").strip()
        if not raw:
            continue
        try:
            scores.append(Decimal(raw))
        except Exception:
            continue

    if not scores:
        return None
    return (sum(scores) / Decimal(len(scores))).quantize(Decimal("0.01"))


def _rank_label(position: int) -> str:
    if position == 1:
        return "1er Puesto"
    if position == 2:
        return "2do Puesto"
    if position == 3:
        return "3er Puesto"
    return f"{position}° Puesto"


def _compute_rankings(
    enrollment_ids_with_score: List[Tuple[int, Optional[Decimal]]],
) -> Dict[int, Dict[str, Any]]:
    """Competition ranking (1,2,2,4) by score desc. None scores go to the bottom."""

    total = len(enrollment_ids_with_score)
    ordered = sorted(
        enrollment_ids_with_score,
        key=lambda item: (
            item[1] is None,
            -(item[1] or Decimal("0.00")),
            item[0],
        ),
    )

    out: Dict[int, Dict[str, Any]] = {}
    last_score: Optional[Decimal] = None
    last_rank = 0
    for idx, (enrollment_id, score) in enumerate(ordered, start=1):
        if score is None:
            rank = idx
        elif last_score is None or score != last_score:
            rank = idx
            last_score = score
        else:
            rank = last_rank

        last_rank = rank
        out[enrollment_id] = {
            "position": rank,
            "total": total,
            "badge_label": _rank_label(rank) if rank in (1, 2, 3) else "",
        }
    return out


def _teacher_assignments(group_id: int, academic_year_id: int) -> List[TeacherAssignment]:
    return list(
        TeacherAssignment.objects.filter(group_id=group_id, academic_year_id=academic_year_id)
        .select_related("academic_load__subject", "academic_load__subject__area")
        .order_by("academic_load__subject__area__name", "academic_load__subject__name", "id")
    )


def build_academic_period_report_context(enrollment: Enrollment, period: Period) -> Dict[str, Any]:
    year_periods = _year_periods(enrollment.academic_year_id)
    assignments = _teacher_assignments(enrollment.group_id, enrollment.academic_year_id) if enrollment.group_id else []

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, year_periods) if assignments else {}
    achievements_by_ta_period, dim_percentage_by_id = (
        _precompute_achievements(assignments, year_periods, enrollment.group_id)
        if assignments and enrollment.group_id
        else ({}, {})
    )

    rows = _build_rows_for_enrollment(
        enrollment=enrollment,
        selected_period=period,
        year_periods=year_periods,
        assignments=assignments,
        gradesheet_id_by_ta_period=gradesheet_id_by_ta_period,
        achievements_by_ta_period=achievements_by_ta_period,
        dim_percentage_by_id=dim_percentage_by_id,
    )

    institution = Institution.objects.first() or Institution()
    director_name = ""
    if enrollment.group and getattr(enrollment.group, "director", None):
        director_name = enrollment.group.director.get_full_name()

    overall_score, overall_scale = _compute_overall_from_rows(enrollment.academic_year_id, rows)

    # Ranking within the student's group (parents see position among classmates).
    rank_position: Optional[int] = None
    rank_total: Optional[int] = None
    rank_badge_label: str = ""
    if enrollment.group_id:
        # NOTE: Don't combine select_related("student__user") with .only(...) that defers
        # the FK field itself (Django raises: cannot be both deferred and traversed).
        # We only need ids + group/year for ranking.
        peers = list(
            Enrollment.objects.filter(group_id=enrollment.group_id, academic_year_id=enrollment.academic_year_id)
            .only("id", "group_id", "academic_year_id")
            .order_by("id")
        )

        peer_scores: List[Tuple[int, Optional[Decimal]]] = []
        for peer in peers:
            peer_rows = _build_rows_for_enrollment(
                enrollment=peer,
                selected_period=period,
                year_periods=year_periods,
                assignments=assignments,
                gradesheet_id_by_ta_period=gradesheet_id_by_ta_period,
                achievements_by_ta_period=achievements_by_ta_period,
                dim_percentage_by_id=dim_percentage_by_id,
            )
            peer_scores.append((peer.id, _overall_decimal_from_rows(peer_rows)))

        ranking = _compute_rankings(peer_scores)
        info = ranking.get(enrollment.id)
        if info:
            rank_position = int(info.get("position") or 0) or None
            rank_total = int(info.get("total") or 0) or None
            rank_badge_label = str(info.get("badge_label") or "")

    return {
        "institution": institution,
        "student_name": enrollment.student.user.get_full_name() if enrollment.student and enrollment.student.user else "",
        "student_code": getattr(enrollment.student, "document_number", "") or "",
        "group_name": _group_label(enrollment.group),
        "shift_name": _shift_label(enrollment.group),
        "period_name": getattr(period, "name", "") or str(period.id),
        "year_name": getattr(enrollment.academic_year, "year", ""),
        "director_name": director_name,
        "report_date": datetime.now().strftime("%d/%m/%Y"),
        "rows": rows,
        "overall_score": overall_score,
        "overall_scale": overall_scale,
        "rank_position": rank_position,
        "rank_total": rank_total,
        "rank_badge_label": rank_badge_label,
        "observations": "",
        "scale_equivalences": _scale_equivalences(enrollment.academic_year_id),
    }


def _precompute_achievements(
    assignments: List[TeacherAssignment],
    year_periods: List[Period],
    group_id: int,
) -> Tuple[
    Dict[Tuple[int, int], List[Dict[str, Any]]],
    Dict[int, int],
]:
    """Returns (achievements_by_ta_period, dimension_percentage_by_id)."""

    academic_year_id = assignments[0].academic_year_id if assignments else None
    if academic_year_id is None:
        return {}, {}

    period_ids = [p.id for p in year_periods]
    load_ids = [ta.academic_load_id for ta in assignments if ta.academic_load_id]

    all_achievements = list(
        Achievement.objects.filter(academic_load_id__in=load_ids, period_id__in=period_ids)
        .select_related("dimension")
        .only("id", "academic_load_id", "period_id", "group_id", "percentage", "dimension_id", "description")
        .order_by("id")
    )

    # Partition by (academic_load_id, period_id) into group-specific vs global.
    partition: Dict[Tuple[int, int], Dict[str, List[Achievement]]] = {}
    for a in all_achievements:
        key = (a.academic_load_id, a.period_id)
        bucket = partition.setdefault(key, {"group": [], "global": []})
        if a.group_id == group_id:
            bucket["group"].append(a)
        elif a.group_id is None:
            bucket["global"].append(a)

    # Collect dimension ids used.
    dimension_ids = set()
    for buckets in partition.values():
        chosen = buckets["group"] if buckets["group"] else buckets["global"]
        for a in chosen:
            if a.dimension_id:
                dimension_ids.add(a.dimension_id)

    # Preload performance indicators for chosen achievements.
    chosen_achievement_ids = set()
    for buckets in partition.values():
        chosen = buckets["group"] if buckets["group"] else buckets["global"]
        for a in chosen:
            if a.id:
                chosen_achievement_ids.add(a.id)

    indicators_by_achievement_id: Dict[int, Dict[str, str]] = {}
    if chosen_achievement_ids:
        for ind in (
            PerformanceIndicator.objects.filter(achievement_id__in=list(chosen_achievement_ids))
            .only("achievement_id", "level", "description")
            .order_by("achievement_id")
        ):
            indicators_by_achievement_id.setdefault(ind.achievement_id, {})[ind.level] = ind.description or ""

    dim_percentage_by_id = {
        d.id: int(d.percentage)
        for d in Dimension.objects.filter(academic_year_id=academic_year_id, id__in=list(dimension_ids)).only(
            "id", "percentage"
        )
    }

    achievements_by_ta_period: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
    for ta in assignments:
        if not ta.academic_load_id:
            continue
        for p in year_periods:
            buckets = partition.get((ta.academic_load_id, p.id), {"group": [], "global": []})
            chosen = buckets["group"] if buckets["group"] else buckets["global"]
            achievements_by_ta_period[(ta.id, p.id)] = [
                {
                    "id": a.id,
                    "dimension_id": a.dimension_id,
                    "percentage": int(a.percentage) if a.percentage else 1,
                    "description": a.description or "",
                    "indicators": indicators_by_achievement_id.get(a.id, {}),
                }
                for a in chosen
            ]

    return achievements_by_ta_period, dim_percentage_by_id


def _precompute_gradesheets(
    assignments: List[TeacherAssignment],
    year_periods: List[Period],
) -> Dict[Tuple[int, int], int]:
    ta_ids = [ta.id for ta in assignments]
    period_ids = [p.id for p in year_periods]
    gradesheets = (
        GradeSheet.objects.filter(teacher_assignment_id__in=ta_ids, period_id__in=period_ids)
        .only("id", "teacher_assignment_id", "period_id")
        .order_by("id")
    )
    out: Dict[Tuple[int, int], int] = {}
    for gs in gradesheets:
        out[(gs.teacher_assignment_id, gs.period_id)] = gs.id
    return out


def _build_rows_for_enrollment(
    enrollment: Enrollment,
    selected_period: Period,
    year_periods: List[Period],
    assignments: List[TeacherAssignment],
    gradesheet_id_by_ta_period: Dict[Tuple[int, int], int],
    achievements_by_ta_period: Dict[Tuple[int, int], List[Dict[str, Any]]],
    dim_percentage_by_id: Dict[int, int],
) -> List[Dict[str, Any]]:
    period_ids = [p.id for p in year_periods]
    period_index_by_id = {p.id: idx for idx, p in enumerate(year_periods)}

    # Pull all grades for this enrollment across gradesheets in year periods.
    gradesheet_ids = list(set(gradesheet_id_by_ta_period.values()))
    grade_qs = AchievementGrade.objects.filter(enrollment_id=enrollment.id, gradesheet_id__in=gradesheet_ids).only(
        "gradesheet_id", "achievement_id", "score"
    )
    score_by_gs_ach: Dict[Tuple[int, int], Optional[Decimal]] = {
        (g.gradesheet_id, g.achievement_id): g.score for g in grade_qs
    }

    def weighted_average_ignore_missing(items: List[Tuple[Optional[Decimal], int]]) -> Optional[Decimal]:
        present = [(Decimal(s), int(w) if w else 1) for s, w in items if s is not None]
        if not present:
            return None
        total_weight = sum(w for _, w in present)
        if total_weight <= 0:
            return None
        total = sum(score * Decimal(weight) for score, weight in present)
        return (total / Decimal(total_weight)).quantize(Decimal("0.01"))

    def compute_subject_score(ta: TeacherAssignment, p: Period) -> Tuple[Optional[Decimal], str]:
        gs_id = gradesheet_id_by_ta_period.get((ta.id, p.id))
        if not gs_id:
            return None, ""

        achievements = achievements_by_ta_period.get((ta.id, p.id), [])
        if not achievements:
            return None, ""

        achievements_by_dimension: Dict[int, List[Dict[str, Any]]] = {}
        for a in achievements:
            dim_id = a.get("dimension_id")
            if not dim_id:
                continue
            achievements_by_dimension.setdefault(dim_id, []).append(a)

        dim_items: List[Tuple[Decimal, int]] = []
        for dim_id, dim_achievements in achievements_by_dimension.items():
            items = [
                (
                    score_by_gs_ach.get((gs_id, int(a["id"]))),
                    int(a.get("percentage") or 1),
                )
                for a in dim_achievements
            ]
            dim_grade = weighted_average(items) if items else DEFAULT_EMPTY_SCORE
            dim_items.append((dim_grade, dim_percentage_by_id.get(dim_id, 0)))

        final_score = final_grade_from_dimensions(dim_items)
        return final_score, _scale_name(enrollment.academic_year_id, final_score)

    rows: List[Dict[str, Any]] = []
    current_area_key: str = ""
    current_area_title: str = ""
    current_subject_rows: List[Dict[str, Any]] = []
    current_area_items_by_period: Dict[int, List[Tuple[Optional[Decimal], int]]] = {}

    selected_period_idx = period_index_by_id.get(selected_period.id, len(period_ids) - 1)

    def area_cell_score(idx: int) -> Tuple[Optional[Decimal], str]:
        if idx < 0 or idx >= 4 or idx >= len(period_ids):
            return None, ""
        if idx > selected_period_idx:
            return None, ""
        pid = period_ids[idx]
        avg = weighted_average_ignore_missing(current_area_items_by_period.get(pid, []))
        return avg, _scale_name(enrollment.academic_year_id, avg)

    def flush_area() -> None:
        nonlocal current_area_key, current_area_title, current_subject_rows, current_area_items_by_period
        if not current_area_key:
            return

        # If the area has only one subject, render it as a single row (no AREA summary row),
        # showing the subject final and no indentation.
        if len(current_subject_rows) == 1:
            single = dict(current_subject_rows[0])
            single["final_display"] = single.get("final_score") or ""
            single["weight_percentage"] = None
            single["is_single_area"] = True
            single["lines_as_paragraph"] = True
            rows.append(single)
        else:
            p_scores: List[Optional[Decimal]] = []
            p_scales: List[str] = []
            for idx in range(4):
                s, sc = area_cell_score(idx)
                p_scores.append(s)
                p_scales.append(sc)

            filled_period_scores = [s for s in p_scores if s is not None]
            final_score = None
            if filled_period_scores:
                final_score = (
                    sum(Decimal(s) for s in filled_period_scores) / Decimal(len(filled_period_scores))
                ).quantize(Decimal("0.01"))

            rows.append(
                {
                    "row_type": "AREA",
                    "title": f"{current_area_title} (ÁREA)" if current_area_title else "",
                    "absences": "",
                    "p1_score": _format_score(p_scores[0]),
                    "p2_score": _format_score(p_scores[1]),
                    "p3_score": _format_score(p_scores[2]),
                    "p4_score": _format_score(p_scores[3]),
                    "final_score": _format_score(final_score),
                    "final_display": _format_score(final_score),
                    "p1_scale": p_scales[0],
                    "p2_scale": p_scales[1],
                    "p3_scale": p_scales[2],
                    "p4_scale": p_scales[3],
                    "final_scale": _scale_name(enrollment.academic_year_id, final_score),
                    "lines": [],
                }
            )

            rows.extend(current_subject_rows)
        current_area_key = ""
        current_area_title = ""
        current_subject_rows = []
        current_area_items_by_period = {}

    for ta in assignments:
        subject_name = None
        area_name = None
        if ta.academic_load_id and ta.academic_load.subject_id:
            subject_name = ta.academic_load.subject.name
            if getattr(ta.academic_load.subject, "area_id", None):
                area_name = ta.academic_load.subject.area.name

        area_key = (area_name or "").strip().upper()
        if not area_key:
            # Subjects without an area must still render. Since there is no area summary
            # row to carry totals, we render these as standalone rows with visible final.
            flush_area()
        if area_key and area_key != current_area_key:
            flush_area()
            current_area_key = area_key
            current_area_title = area_key

        title = (subject_name or f"Carga {ta.academic_load_id}").strip()
        weight_pct = int(getattr(ta.academic_load, "weight_percentage", 100) or 100)

        scores_by_period: Dict[int, Optional[Decimal]] = {}
        scales_by_period: Dict[int, str] = {}
        for p in year_periods:
            s, sc = compute_subject_score(ta, p)
            scores_by_period[p.id] = s
            scales_by_period[p.id] = sc
            if area_key and s is not None:
                current_area_items_by_period.setdefault(p.id, []).append((s, weight_pct))

        filled = [Decimal(s) for s in scores_by_period.values() if s is not None]
        final_score = None
        if filled:
            avg = sum(filled) / Decimal(len(filled))
            final_score = avg.quantize(Decimal("0.01"))

        # logro/dificultad lines: use achievements descriptions for selected period
        selected_achievements = achievements_by_ta_period.get((ta.id, selected_period.id), [])
        selected_lines: List[str] = []
        gs_id_for_selected = gradesheet_id_by_ta_period.get((ta.id, selected_period.id))
        for a in selected_achievements:
            ach_id = int(a.get("id") or 0)
            fallback = (a.get("description") or "").strip()
            if not ach_id:
                if fallback:
                    selected_lines.append(fallback)
                continue

            score = None
            if gs_id_for_selected:
                score = score_by_gs_ach.get((gs_id_for_selected, ach_id))

            level = None
            if score is not None:
                scale = match_scale(enrollment.academic_year_id, Decimal(score))
                level = _indicator_level_from_scale_name(scale.name if scale else "")

            indicators = a.get("indicators") or {}
            if level and indicators.get(level):
                selected_lines.append(str(indicators[level]).strip())
            elif fallback:
                selected_lines.append(fallback)

        def cell_score(idx: int) -> str:
            if idx < 0 or idx >= 4:
                return ""
            if idx >= len(period_ids):
                return ""
            pid = period_ids[idx]
            if idx > selected_period_idx:
                return ""
            return _format_score(scores_by_period.get(pid))

        def cell_scale(idx: int) -> str:
            if idx < 0 or idx >= 4:
                return ""
            if idx >= len(period_ids):
                return ""
            pid = period_ids[idx]
            if idx > selected_period_idx:
                return ""
            return scales_by_period.get(pid, "")

        subject_row = {
            "row_type": "SUBJECT",
            "title": title,
            "weight_percentage": weight_pct,
            "absences": "",
            "p1_score": cell_score(0),
            "p2_score": cell_score(1),
            "p3_score": cell_score(2),
            "p4_score": cell_score(3),
            "final_score": _format_score(final_score),
            "final_display": "",
            "p1_scale": cell_scale(0),
            "p2_scale": cell_scale(1),
            "p3_scale": cell_scale(2),
            "p4_scale": cell_scale(3),
            "final_scale": _scale_name(enrollment.academic_year_id, final_score),
            "lines": selected_lines[:6],
            "is_single_area": False,
            "lines_as_paragraph": False,
        }

        if not area_key:
            subject_row["final_display"] = subject_row.get("final_score") or ""
            subject_row["weight_percentage"] = None
            subject_row["is_single_area"] = True
            subject_row["lines_as_paragraph"] = True
            rows.append(subject_row)
        else:
            current_subject_rows.append(subject_row)

    flush_area()
    return rows


def generate_academic_period_report_pdf(enrollment: Enrollment, period: Period) -> bytes:
    ctx = build_academic_period_report_context(enrollment=enrollment, period=period)

    html_string = render_to_string("students/reports/academic_period_report_pdf.html", ctx)
    try:
        return render_pdf_bytes_from_html(html=html_string, base_url=str(settings.BASE_DIR))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Error generating PDF") from exc


def generate_academic_period_group_report_pdf(
    enrollments: Iterable[Enrollment],
    period: Period,
) -> bytes:
    enrollments = list(enrollments)
    if not enrollments:
        raise ValueError("No enrollments")

    academic_year_id = enrollments[0].academic_year_id
    group = enrollments[0].group

    year_periods = _year_periods(academic_year_id)
    assignments = _teacher_assignments(group.id, academic_year_id) if group else []

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, year_periods) if assignments else {}
    achievements_by_ta_period, dim_percentage_by_id = (
        _precompute_achievements(assignments, year_periods, group.id) if assignments and group else ({}, {})
    )

    institution = Institution.objects.first() or Institution()
    scale_equivalences = _scale_equivalences(academic_year_id)

    ctx = build_academic_period_group_report_context(enrollments=enrollments, period=period)
    html_string = render_to_string("students/reports/academic_period_report_group_pdf.html", ctx)

    try:
        return render_pdf_bytes_from_html(html=html_string, base_url=str(settings.BASE_DIR))
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Error generating PDF") from exc


def build_academic_period_group_report_context(
    enrollments: Iterable[Enrollment],
    period: Period,
) -> Dict[str, Any]:
    enrollments = list(enrollments)
    if not enrollments:
        raise ValueError("No enrollments")

    academic_year_id = enrollments[0].academic_year_id
    group = enrollments[0].group

    year_periods = _year_periods(academic_year_id)
    assignments = _teacher_assignments(group.id, academic_year_id) if group else []

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, year_periods) if assignments else {}
    achievements_by_ta_period, dim_percentage_by_id = (
        _precompute_achievements(assignments, year_periods, group.id) if assignments and group else ({}, {})
    )

    institution = Institution.objects.first() or Institution()
    scale_equivalences = _scale_equivalences(academic_year_id)

    pages: List[Dict[str, Any]] = []
    score_items: List[Tuple[int, Optional[Decimal]]] = []
    for enrollment in enrollments:
        director_name = ""
        if enrollment.group and getattr(enrollment.group, "director", None):
            director_name = enrollment.group.director.get_full_name()

        rows = _build_rows_for_enrollment(
            enrollment=enrollment,
            selected_period=period,
            year_periods=year_periods,
            assignments=assignments,
            gradesheet_id_by_ta_period=gradesheet_id_by_ta_period,
            achievements_by_ta_period=achievements_by_ta_period,
            dim_percentage_by_id=dim_percentage_by_id,
        )

        overall_score, overall_scale = _compute_overall_from_rows(academic_year_id, rows)
        score_items.append((enrollment.id, _overall_decimal_from_rows(rows)))

        pages.append(
            {
                "enrollment_id": enrollment.id,
                "institution": institution,
                "student_name": enrollment.student.user.get_full_name()
                if enrollment.student and enrollment.student.user
                else "",
                "student_code": getattr(enrollment.student, "document_number", "") or "",
                "group_name": _group_label(enrollment.group),
                "shift_name": _shift_label(enrollment.group),
                "period_name": getattr(period, "name", "") or str(period.id),
                "year_name": getattr(enrollment.academic_year, "year", ""),
                "director_name": director_name,
                "report_date": datetime.now().strftime("%d/%m/%Y"),
                "rows": rows,
                "overall_score": overall_score,
                "overall_scale": overall_scale,
                "rank_position": None,
                "rank_total": None,
                "rank_badge_label": "",
                "observations": "",
                "scale_equivalences": scale_equivalences,
                "final_status": getattr(enrollment, "final_status", "") or "",
            }
        )

    ranking = _compute_rankings(score_items)
    for page in pages:
        info = ranking.get(page.get("enrollment_id"))
        if not info:
            continue
        page["rank_position"] = int(info.get("position") or 0) or None
        page["rank_total"] = int(info.get("total") or 0) or None
        page["rank_badge_label"] = str(info.get("badge_label") or "")

    return {"pages": pages}


def compute_certificate_studies_rows(enrollment: Enrollment) -> List[Dict[str, Any]]:
    """Compute final subject rows for a 'certificado de estudios'.

    Uses the same gradebook computation logic as the academic period report.
    Returns subject-level items with keys:
    - academic_load_id, subject_id
    - area_name, subject_name
    - weight_percentage, hours_per_week
    - area_subject (legacy display), score, performance
    """

    if not enrollment.group_id:
        return []

    year_periods = _year_periods(enrollment.academic_year_id)
    if not year_periods:
        return []

    # Pick the latest period available for the year as the reference.
    selected_period = year_periods[-1]

    assignments = _teacher_assignments(enrollment.group_id, enrollment.academic_year_id)
    if not assignments:
        return []

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, year_periods)
    achievements_by_ta_period, dim_percentage_by_id = _precompute_achievements(assignments, year_periods, enrollment.group_id)

    report_rows = _build_rows_for_enrollment(
        enrollment=enrollment,
        selected_period=selected_period,
        year_periods=year_periods,
        assignments=assignments,
        gradesheet_id_by_ta_period=gradesheet_id_by_ta_period,
        achievements_by_ta_period=achievements_by_ta_period,
        dim_percentage_by_id=dim_percentage_by_id,
    )

    out: List[Dict[str, Any]] = []
    # report_rows are built by iterating `assignments` in order.
    for ta, r in zip(assignments, report_rows):
        title = (r.get("title") or "").strip()
        final_score = (r.get("final_score") or "").strip()
        final_scale = (r.get("final_scale") or "").strip()

        academic_load = getattr(ta, "academic_load", None)
        subject = getattr(academic_load, "subject", None) if academic_load else None
        area = getattr(subject, "area", None) if subject else None

        out.append(
            {
                "academic_load_id": getattr(ta, "academic_load_id", None),
                "subject_id": getattr(subject, "id", None),
                "area_name": getattr(area, "name", "") or "",
                "subject_name": getattr(subject, "name", "") or "",
                "weight_percentage": int(getattr(academic_load, "weight_percentage", 100) or 100)
                if academic_load
                else 100,
                "hours_per_week": int(getattr(academic_load, "hours_per_week", 0) or 0) if academic_load else 0,
                # Keep the legacy combined label for compatibility.
                "area_subject": title,
                "score": final_score,
                "performance": final_scale,
            }
        )

    return out
