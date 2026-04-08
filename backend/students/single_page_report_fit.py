from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from django.conf import settings
from django.template.loader import render_to_string

from reports.weasyprint_utils import render_pdf_bytes_from_html


@dataclass(frozen=True)
class FitProfile:
    level: str
    max_lines_per_subject: int
    max_line_chars: int
    max_preschool_desc_chars: int
    hide_rank: bool
    hide_qr: bool
    remove_area_rows: bool


FIT_PROFILES: tuple[FitProfile, ...] = (
    FitProfile(
        level="l0",
        max_lines_per_subject=6,
        max_line_chars=160,
        max_preschool_desc_chars=220,
        hide_rank=False,
        hide_qr=False,
        remove_area_rows=False,
    ),
    FitProfile(
        level="l1",
        max_lines_per_subject=4,
        max_line_chars=120,
        max_preschool_desc_chars=150,
        hide_rank=True,
        hide_qr=False,
        remove_area_rows=False,
    ),
    FitProfile(
        level="l2",
        max_lines_per_subject=2,
        max_line_chars=90,
        max_preschool_desc_chars=105,
        hide_rank=True,
        hide_qr=True,
        remove_area_rows=True,
    ),
)


def fit_report_to_single_page(
    report_context: dict[str, Any],
    *,
    template_name: str,
    is_preschool: bool,
) -> dict[str, Any]:
    """Return a context optimized to fit a single PDF page.

    The function validates page count with a real PDF render and applies
    progressive compactation levels until the report fits one page.
    """

    base_context = deepcopy(report_context)
    last_candidate = deepcopy(base_context)

    for profile in FIT_PROFILES:
        candidate = _apply_compactation(base_context, profile=profile, is_preschool=is_preschool)
        try:
            pages = _count_pdf_pages(template_name=template_name, context=candidate)
        except Exception:
            return _fallback_without_pdf_measurement(base_context, is_preschool=is_preschool)
        if pages <= 1:
            return candidate
        last_candidate = candidate

    # Extreme fallback: keep shrinking non-essential content until one page.
    candidate = deepcopy(last_candidate)
    for _ in range(6):
        candidate = _apply_extreme_trim(candidate, is_preschool=is_preschool)
        try:
            pages = _count_pdf_pages(template_name=template_name, context=candidate)
        except Exception:
            return _fallback_without_pdf_measurement(base_context, is_preschool=is_preschool)
        if pages <= 1:
            return candidate

    # Hard fallback to avoid second page even in pathological cases.
    final_candidate = _force_single_page_minimal(candidate, is_preschool=is_preschool)
    final_candidate["report_fit"] = {
        "level": "l2",
        "hide_rank": True,
        "hide_qr": True,
        "is_extreme": True,
    }
    return final_candidate


def _count_pdf_pages(*, template_name: str, context: dict[str, Any]) -> int:
    html_string = render_to_string(template_name, context)
    pdf_bytes = render_pdf_bytes_from_html(html=html_string, base_url=str(settings.BASE_DIR))
    from pypdf import PdfReader  # noqa: PLC0415

    reader = PdfReader(BytesIO(pdf_bytes))
    return len(reader.pages)


def _fallback_without_pdf_measurement(context: dict[str, Any], *, is_preschool: bool) -> dict[str, Any]:
    """Fallback for environments without PDF rendering dependencies.

    This keeps preview/report HTML paths working without WeasyPrint while still
    applying progressive compactation heuristics.
    """

    rows = context.get("rows") or []
    if not isinstance(rows, list):
        return _apply_compactation(context, profile=FIT_PROFILES[0], is_preschool=is_preschool)

    if is_preschool:
        achievement_rows = [r for r in rows if isinstance(r, dict) and str(r.get("row_type") or "").upper() == "ACHIEVEMENT"]
        if len(achievement_rows) > 26:
            return _apply_compactation(context, profile=FIT_PROFILES[2], is_preschool=True)
        if len(achievement_rows) > 18:
            return _apply_compactation(context, profile=FIT_PROFILES[1], is_preschool=True)
        return _apply_compactation(context, profile=FIT_PROFILES[0], is_preschool=True)

    subjects = [r for r in rows if isinstance(r, dict) and str(r.get("row_type") or "").upper() == "SUBJECT"]
    total_lines = 0
    for subject in subjects:
        lines = subject.get("lines") or []
        if isinstance(lines, list):
            total_lines += len(lines)

    complexity_score = len(subjects) * 2 + total_lines
    if complexity_score > 80:
        return _apply_compactation(context, profile=FIT_PROFILES[2], is_preschool=False)
    if complexity_score > 55:
        return _apply_compactation(context, profile=FIT_PROFILES[1], is_preschool=False)
    return _apply_compactation(context, profile=FIT_PROFILES[0], is_preschool=False)


def _apply_compactation(
    context: dict[str, Any],
    *,
    profile: FitProfile,
    is_preschool: bool,
) -> dict[str, Any]:
    optimized = deepcopy(context)
    optimized["report_fit"] = {
        "level": profile.level,
        "hide_rank": profile.hide_rank,
        "hide_qr": profile.hide_qr,
        "is_extreme": False,
    }

    rows = optimized.get("rows") or []
    if not isinstance(rows, list):
        return optimized

    if is_preschool:
        optimized["rows"] = _compact_preschool_rows(rows, profile=profile)
    else:
        optimized["rows"] = _compact_regular_rows(rows, profile=profile)

    return optimized


def _compact_regular_rows(rows: list[dict[str, Any]], *, profile: FitProfile) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_type = str(row.get("row_type") or "").upper()
        if profile.remove_area_rows and row_type == "AREA":
            continue

        current = dict(row)
        lines = current.get("lines") or []
        if isinstance(lines, list):
            trimmed_lines = [str(line or "").strip()[: profile.max_line_chars].strip() for line in lines if str(line or "").strip()]
            current["lines"] = trimmed_lines[: profile.max_lines_per_subject]
        out.append(current)
    return out


def _compact_preschool_rows(rows: list[dict[str, Any]], *, profile: FitProfile) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        current = dict(row)
        row_type = str(current.get("row_type") or "").upper()
        if row_type == "ACHIEVEMENT":
            description = str(current.get("description") or "").strip()
            current["description"] = description[: profile.max_preschool_desc_chars].strip()
        out.append(current)

    if profile.level != "l2":
        return out

    # Keep all SUBJECT rows and a bounded amount of ACHIEVEMENT rows.
    bounded: list[dict[str, Any]] = []
    achievements_kept = 0
    max_achievements = 20
    hidden_achievements = 0
    for row in out:
        row_type = str(row.get("row_type") or "").upper()
        if row_type == "SUBJECT":
            bounded.append(row)
            continue
        if row_type == "ACHIEVEMENT":
            if achievements_kept < max_achievements:
                bounded.append(row)
                achievements_kept += 1
            else:
                hidden_achievements += 1
            continue
        bounded.append(row)

    if hidden_achievements:
        bounded.append(
            {
                "row_type": "ACHIEVEMENT",
                "description": f"Logros adicionales compactados: {hidden_achievements}",
                "label": "",
            }
        )
    return bounded


def _apply_extreme_trim(context: dict[str, Any], *, is_preschool: bool) -> dict[str, Any]:
    optimized = deepcopy(context)
    fit = dict(optimized.get("report_fit") or {})
    fit.update({"level": "l2", "hide_rank": True, "hide_qr": True, "is_extreme": True})
    optimized["report_fit"] = fit

    rows = optimized.get("rows") or []
    if not isinstance(rows, list):
        return optimized

    if is_preschool:
        for row in rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("row_type") or "").upper() == "ACHIEVEMENT":
                row["description"] = str(row.get("description") or "")[:80].strip()
        return optimized

    for row in rows:
        if not isinstance(row, dict):
            continue
        row["lines"] = []
    optimized["rows"] = [r for r in rows if str(r.get("row_type") or "").upper() != "AREA"]
    return optimized


def _force_single_page_minimal(context: dict[str, Any], *, is_preschool: bool) -> dict[str, Any]:
    optimized = deepcopy(context)
    rows = optimized.get("rows") or []
    if not isinstance(rows, list):
        return optimized

    if is_preschool:
        out: list[dict[str, Any]] = []
        achievement_count = 0
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_type = str(row.get("row_type") or "").upper()
            if row_type == "SUBJECT":
                out.append(row)
                continue
            if row_type == "ACHIEVEMENT":
                if achievement_count < 12:
                    short = dict(row)
                    short["description"] = str(short.get("description") or "")[:60].strip()
                    out.append(short)
                    achievement_count += 1
                continue
            out.append(row)
        optimized["rows"] = out
        return optimized

    out = []
    subject_count = 0
    hidden_subjects = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_type = str(row.get("row_type") or "").upper()
        if row_type == "AREA":
            continue
        if row_type == "SUBJECT":
            if subject_count < 22:
                short = dict(row)
                short["lines"] = []
                out.append(short)
                subject_count += 1
            else:
                hidden_subjects += 1
            continue
        out.append(row)

    if hidden_subjects:
        out.append(
            {
                "row_type": "SUBJECT",
                "title": f"Asignaturas adicionales compactadas: {hidden_subjects}",
                "absences": "",
                "p1_score": "",
                "p2_score": "",
                "p3_score": "",
                "p4_score": "",
                "final_score": "",
                "p1_scale": "",
                "p2_scale": "",
                "p3_scale": "",
                "p4_scale": "",
                "final_scale": "",
                "lines": [],
                "is_single_area": False,
                "lines_as_paragraph": False,
            }
        )

    optimized["rows"] = out
    return optimized
