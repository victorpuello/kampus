from __future__ import annotations

import io
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string

from academic.grading import DEFAULT_EMPTY_SCORE, final_grade_from_dimensions, match_scale, weighted_average
from academic.models import Achievement, AchievementGrade, Dimension, EvaluationScale, GradeSheet, Period, TeacherAssignment
from core.models import Institution
from students.models import Enrollment

try:
    from xhtml2pdf import pisa  # type: ignore[import-not-found]
except Exception:  # pragma: no cover
    pisa = None


def _pisa_link_callback(uri: str, rel: str):
    if uri is None:
        return uri
    uri = str(uri)

    if uri.startswith("http://") or uri.startswith("https://"):
        return uri

    media_url = getattr(settings, "MEDIA_URL", "") or ""
    static_url = getattr(settings, "STATIC_URL", "") or ""

    if media_url and uri.startswith(media_url):
        path = os.path.join(settings.MEDIA_ROOT, uri[len(media_url) :].lstrip("/\\"))
        return os.path.normpath(path)

    if static_url and uri.startswith(static_url):
        static_root = getattr(settings, "STATIC_ROOT", None)
        if static_root:
            path = os.path.join(static_root, uri[len(static_url) :].lstrip("/\\"))
            return os.path.normpath(path)

    if os.path.isabs(uri) and os.path.exists(uri):
        return os.path.normpath(uri)

    if rel:
        candidate = os.path.normpath(os.path.join(os.path.dirname(rel), uri))
        if os.path.exists(candidate):
            return candidate

    return uri


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


def _teacher_assignments(group_id: int, academic_year_id: int) -> List[TeacherAssignment]:
    return list(
        TeacherAssignment.objects.filter(group_id=group_id, academic_year_id=academic_year_id)
        .select_related("academic_load__subject", "academic_load__subject__area")
        .order_by("academic_load__subject__area__name", "academic_load__subject__name", "id")
    )


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
    for ta in assignments:
        subject_name = None
        area_name = None
        if ta.academic_load_id and ta.academic_load.subject_id:
            subject_name = ta.academic_load.subject.name
            if getattr(ta.academic_load.subject, "area_id", None):
                area_name = ta.academic_load.subject.area.name

        title = (subject_name or f"Carga {ta.academic_load_id}").upper()
        if area_name:
            title = f"{area_name} - {title}".upper()

        scores_by_period: Dict[int, Optional[Decimal]] = {}
        scales_by_period: Dict[int, str] = {}
        for p in year_periods:
            s, sc = compute_subject_score(ta, p)
            scores_by_period[p.id] = s
            scales_by_period[p.id] = sc

        filled = [Decimal(s) for s in scores_by_period.values() if s is not None]
        final_score = None
        if filled:
            avg = sum(filled) / Decimal(len(filled))
            final_score = avg.quantize(Decimal("0.01"))

        # logro/dificultad lines: use achievements descriptions for selected period
        selected_achievements = achievements_by_ta_period.get((ta.id, selected_period.id), [])
        selected_lines = [a.get("description") for a in selected_achievements if a.get("description")]  # type: ignore

        def cell_score(idx: int) -> str:
            if idx < 0 or idx >= 4:
                return ""
            if idx >= len(period_ids):
                return ""
            pid = period_ids[idx]
            sel_idx = period_index_by_id.get(selected_period.id, len(period_ids) - 1)
            if idx > sel_idx:
                return ""
            return _format_score(scores_by_period.get(pid))

        def cell_scale(idx: int) -> str:
            if idx < 0 or idx >= 4:
                return ""
            if idx >= len(period_ids):
                return ""
            pid = period_ids[idx]
            sel_idx = period_index_by_id.get(selected_period.id, len(period_ids) - 1)
            if idx > sel_idx:
                return ""
            return scales_by_period.get(pid, "")

        rows.append(
            {
                "title": title,
                "absences": "",
                "p1_score": cell_score(0),
                "p2_score": cell_score(1),
                "p3_score": cell_score(2),
                "p4_score": cell_score(3),
                "final_score": _format_score(final_score),
                "p1_scale": cell_scale(0),
                "p2_scale": cell_scale(1),
                "p3_scale": cell_scale(2),
                "p4_scale": cell_scale(3),
                "final_scale": _scale_name(enrollment.academic_year_id, final_score),
                "lines": selected_lines[:6],
            }
        )

    return rows


def generate_academic_period_report_pdf(enrollment: Enrollment, period: Period) -> bytes:
    if not pisa:
        raise RuntimeError("PDF generation library not installed")

    year_periods = _year_periods(enrollment.academic_year_id)
    assignments = _teacher_assignments(enrollment.group_id, enrollment.academic_year_id) if enrollment.group_id else []

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, year_periods) if assignments else {}
    achievements_by_ta_period, dim_percentage_by_id = (
        _precompute_achievements(assignments, year_periods, enrollment.group_id) if assignments and enrollment.group_id else ({}, {})
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

    ctx = {
        "institution": institution,
        "student_name": enrollment.student.user.get_full_name() if enrollment.student and enrollment.student.user else "",
        "student_code": getattr(enrollment.student, "document_number", "") or "",
        "group_name": getattr(enrollment.group, "name", "") or "",
        "shift_name": getattr(enrollment.group, "shift", "") or "",
        "period_name": getattr(period, "name", "") or str(period.id),
        "year_name": getattr(enrollment.academic_year, "year", ""),
        "director_name": director_name,
        "report_date": datetime.now().strftime("%m/%d/%Y"),
        "rows": rows,
        "observations": "",
        "scale_equivalences": _scale_equivalences(enrollment.academic_year_id),
    }

    html_string = render_to_string("students/reports/academic_period_report_pdf.html", ctx)

    result = io.BytesIO()
    pdf = pisa.pisaDocument(
        io.BytesIO(html_string.encode("UTF-8")),
        result,
        link_callback=_pisa_link_callback,
        encoding="UTF-8",
    )
    if pdf.err:
        raise RuntimeError("Error generating PDF")

    return result.getvalue()


def generate_academic_period_group_report_pdf(
    enrollments: Iterable[Enrollment],
    period: Period,
) -> bytes:
    if not pisa:
        raise RuntimeError("PDF generation library not installed")

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

        pages.append(
            {
                "institution": institution,
                "student_name": enrollment.student.user.get_full_name() if enrollment.student and enrollment.student.user else "",
                "student_code": getattr(enrollment.student, "document_number", "") or "",
                "group_name": getattr(enrollment.group, "name", "") or "",
                "shift_name": getattr(enrollment.group, "shift", "") or "",
                "period_name": getattr(period, "name", "") or str(period.id),
                "year_name": getattr(enrollment.academic_year, "year", ""),
                "director_name": director_name,
                "report_date": datetime.now().strftime("%m/%d/%Y"),
                "rows": rows,
                "observations": "",
                "scale_equivalences": scale_equivalences,
            }
        )

    html_string = render_to_string("students/reports/academic_period_report_group_pdf.html", {"pages": pages})

    result = io.BytesIO()
    pdf = pisa.pisaDocument(
        io.BytesIO(html_string.encode("UTF-8")),
        result,
        link_callback=_pisa_link_callback,
        encoding="UTF-8",
    )
    if pdf.err:
        raise RuntimeError("Error generating PDF")

    return result.getvalue()
