from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from academic.grading import final_grade_from_dimensions, match_scale
from academic.models import AcademicLoad, AchievementGrade, Group, Period, TeacherAssignment
from core.models import Institution
from students.models import Enrollment

from .academic_period_report import (
    _format_score,
    _group_label,
    _shift_label,
    _precompute_achievements,
    _precompute_gradesheets,
    _teacher_assignments,
)


@dataclass(frozen=True)
class _Column:
    academic_load_id: int
    teacher_assignment_id: Optional[int]
    subject_id: int
    subject_name: str
    area_name: str
    short_label: str


def _short_subject_label(subject_name: str, *, max_len: int = 14) -> str:
    name = (subject_name or "").strip()
    if not name:
        return ""

    # Try to create a compact label: keep first word and initials of the rest.
    parts = [p for p in name.replace("/", " ").split() if p]
    if not parts:
        return name[:max_len]

    if len(parts) == 1:
        base = parts[0]
    else:
        initials = "".join((p[0] for p in parts[1:] if p))
        base = f"{parts[0]} {initials}".strip()

    if len(base) <= max_len:
        return base
    return (base[: max_len - 1] + "…") if max_len >= 2 else base[:max_len]


def _grade_css_class(scale_name: str) -> str:
    s = (scale_name or "").strip().lower()
    if not s:
        return ""
    if "bajo" in s:
        return "grade-low"
    if "basi" in s:
        return "grade-basic"
    if "alto" in s:
        return "grade-high"
    if "super" in s:
        return "grade-superior"
    return ""


def _student_display(enrollment: Enrollment) -> str:
    user = getattr(getattr(enrollment, "student", None), "user", None)
    if not user:
        return ""
    last_name = (getattr(user, "last_name", "") or "").strip()
    first_name = (getattr(user, "first_name", "") or "").strip()
    full = f"{last_name} {first_name}".strip()
    return full or (user.get_full_name() if hasattr(user, "get_full_name") else "")


def build_academic_period_sabana_context(*, group: Group, period: Period) -> Dict[str, Any]:
    if period.academic_year_id != group.academic_year_id:
        raise ValueError("El periodo no corresponde al año lectivo del grupo")

    institution = Institution.objects.first() or Institution()

    institution_logo_src: str = ""
    try:
        if getattr(institution, "pdf_show_logo", True) and getattr(institution, "logo", None):
            logo_field = institution.logo
            if getattr(logo_field, "path", None) and Path(logo_field.path).exists():
                institution_logo_src = Path(logo_field.path).resolve().as_uri()
            elif getattr(logo_field, "url", None):
                # Fallback: may work if WeasyPrint base_url can resolve MEDIA_URL.
                institution_logo_src = logo_field.url
    except Exception:
        institution_logo_src = ""

    director_name = ""
    try:
        director = getattr(group, "director", None)
        if director and hasattr(director, "get_full_name"):
            director_name = (director.get_full_name() or "").strip()
    except Exception:
        director_name = ""

    group_short_name = (getattr(group, "name", "") or "").strip()
    grade_name = ""
    try:
        grade = getattr(group, "grade", None)
        grade_name = (getattr(grade, "name", "") or "").strip()
    except Exception:
        grade_name = ""

    enrollments = list(
        Enrollment.objects.select_related(
            "student",
            "student__user",
            "grade",
            "group",
            "academic_year",
        )
        .filter(group_id=group.id, academic_year_id=period.academic_year_id, status="ACTIVE")
        .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
    )

    # Plan de estudio: todas las asignaturas configuradas para el grado.
    academic_loads = list(
        AcademicLoad.objects.select_related("subject", "subject__area")
        .filter(grade_id=group.grade_id)
        .order_by("subject__area__name", "subject__name", "id")
    )

    # Asignación docente (si existe) para poder calcular notas. Si no hay, la columna queda en blanco.
    ta_by_load_id: Dict[int, TeacherAssignment] = {
        int(ta.academic_load_id): ta
        for ta in _teacher_assignments(group.id, period.academic_year_id)
        if getattr(ta, "academic_load_id", None)
    }

    assignments = list(ta_by_load_id.values())

    gradesheet_id_by_ta_period = _precompute_gradesheets(assignments, [period]) if assignments else {}
    achievements_by_ta_period, dim_percentage_by_id = (
        _precompute_achievements(assignments, [period], group.id) if assignments else ({}, {})
    )

    columns: List[_Column] = []
    for al in academic_loads:
        subject = getattr(al, "subject", None)
        if not subject:
            continue
        area = getattr(subject, "area", None)
        subject_name = getattr(subject, "name", "") or ""
        area_name = getattr(area, "name", "") or ""
        ta = ta_by_load_id.get(int(al.id))
        columns.append(
            _Column(
                academic_load_id=int(al.id),
                teacher_assignment_id=(int(ta.id) if ta else None),
                subject_id=int(subject.id),
                subject_name=subject_name,
                area_name=area_name,
                short_label=_short_subject_label(subject_name),
            )
        )

    # Build a fast lookup of grades: (enrollment_id, gradesheet_id, achievement_id) -> score
    enrollment_ids = [e.id for e in enrollments]
    gradesheet_ids = list(set(gradesheet_id_by_ta_period.values()))

    score_by_enroll_gs_ach: Dict[Tuple[int, int, int], Optional[Decimal]] = {}
    if enrollment_ids and gradesheet_ids:
        grade_qs = (
            AchievementGrade.objects.filter(enrollment_id__in=enrollment_ids, gradesheet_id__in=gradesheet_ids)
            .only("enrollment_id", "gradesheet_id", "achievement_id", "score")
            .order_by("id")
        )
        for g in grade_qs:
            score_by_enroll_gs_ach[(int(g.enrollment_id), int(g.gradesheet_id), int(g.achievement_id))] = g.score

    def weighted_average_ignore_missing(items: Iterable[Tuple[Optional[Decimal], int]]) -> Optional[Decimal]:
        present = [(Decimal(s), int(w) if w else 1) for s, w in items if s is not None]
        if not present:
            return None
        total_weight = sum(w for _, w in present)
        if total_weight <= 0:
            return None
        total = sum(score * Decimal(weight) for score, weight in present)
        return (total / Decimal(total_weight)).quantize(Decimal("0.01"))

    def compute_subject_score(enrollment_id: int, teacher_assignment_id: Optional[int]) -> Tuple[Optional[Decimal], str]:
        if not teacher_assignment_id:
            return None, ""

        gs_id = gradesheet_id_by_ta_period.get((teacher_assignment_id, period.id))
        if not gs_id:
            return None, ""

        achievements = achievements_by_ta_period.get((teacher_assignment_id, period.id), [])
        if not achievements:
            return None, ""

        achievements_by_dimension: Dict[int, List[Dict[str, Any]]] = {}
        for a in achievements:
            dim_id = a.get("dimension_id")
            if not dim_id:
                continue
            achievements_by_dimension.setdefault(int(dim_id), []).append(a)

        dim_items: List[Tuple[Decimal, int]] = []
        for dim_id, dim_achievements in achievements_by_dimension.items():
            items = [
                (
                    score_by_enroll_gs_ach.get((enrollment_id, int(gs_id), int(a["id"]))),
                    int(a.get("percentage") or 1),
                )
                for a in dim_achievements
            ]
            dim_grade = weighted_average_ignore_missing(items)
            if dim_grade is None:
                continue

            dim_weight = int(dim_percentage_by_id.get(dim_id, 0) or 0)
            if dim_weight <= 0:
                continue
            dim_items.append((dim_grade, dim_weight))

        if not dim_items:
            return None, ""

        final_score = final_grade_from_dimensions(dim_items)

        scale = match_scale(period.academic_year_id, Decimal(final_score))
        return final_score, (scale.name if scale else "")

    rows: List[Dict[str, Any]] = []
    student_avgs: List[Decimal] = []
    approved_count = 0
    at_risk_count = 0

    for idx, enr in enumerate(enrollments, start=1):
        scores: List[Dict[str, Any]] = []
        present_scores: List[Decimal] = []
        lost = 0

        for col in columns:
            score, scale_name = compute_subject_score(int(enr.id), col.teacher_assignment_id)
            css = _grade_css_class(scale_name)
            if score is not None:
                present_scores.append(Decimal(score))
            if css == "grade-low":
                lost += 1

            scores.append(
                {
                    "score": _format_score(score),
                    "scale": scale_name,
                    "css": css,
                }
            )

        avg_score: Optional[Decimal] = None
        if present_scores:
            avg_score = (sum(present_scores) / Decimal(len(present_scores))).quantize(Decimal("0.01"))
            student_avgs.append(avg_score)

        avg_scale = match_scale(period.academic_year_id, Decimal(avg_score)) if avg_score is not None else None
        avg_scale_name = avg_scale.name if avg_scale else ""

        if lost == 0:
            approved_count += 1
        else:
            at_risk_count += 1

        rows.append(
            {
                "index": idx,
                "student_name": _student_display(enr),
                "scores": scores,
                "avg_score": _format_score(avg_score),
                "avg_scale": avg_scale_name,
                "avg_css": _grade_css_class(avg_scale_name),
                "lost_count": lost,
                "lost_display": "-" if lost == 0 else str(lost),
                "lost_css": "lost-none" if lost == 0 else "lost-some",
            }
        )

    group_avg: Optional[Decimal] = None
    if student_avgs:
        group_avg = (sum(student_avgs) / Decimal(len(student_avgs))).quantize(Decimal("0.01"))

    group_avg_scale = match_scale(period.academic_year_id, Decimal(group_avg)) if group_avg is not None else None
    group_avg_scale_name = group_avg_scale.name if group_avg_scale else ""

    return {
        "institution": institution,
        "institution_logo_src": institution_logo_src,
        "title": "Sábana de notas",
        "generated_on": date.today(),
        "year_name": getattr(group.academic_year, "year", "") if getattr(group, "academic_year", None) else "",
        "period_name": getattr(period, "name", "") or "",
        "group_name": _group_label(group),
        "group_short_name": group_short_name,
        "grade_name": grade_name,
        "director_name": director_name,
        "shift_name": _shift_label(group),
        "columns": [
            {
                "short_label": c.short_label,
                "subject_name": c.subject_name,
                "area_name": c.area_name,
            }
            for c in columns
        ],
        "rows": rows,
        "footer": {
            "group_avg": _format_score(group_avg),
            "group_avg_scale": group_avg_scale_name,
            "group_avg_css": _grade_css_class(group_avg_scale_name),
            "approved": approved_count,
            "at_risk": at_risk_count,
            "total": len(rows),
        },
    }
