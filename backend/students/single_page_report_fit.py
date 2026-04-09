from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from django.conf import settings
from django.template.loader import render_to_string

from reports.weasyprint_utils import render_pdf_bytes_from_html


@dataclass(frozen=True)
class LayoutProfile:
    name: str
    split_target_ratio: float


@dataclass(frozen=True)
class SplitBlock:
    start: int
    end: int
    weight: float


LAYOUT_PROFILES: tuple[LayoutProfile, ...] = (
    LayoutProfile(name="p0", split_target_ratio=0.50),
    LayoutProfile(name="p1", split_target_ratio=0.52),
    LayoutProfile(name="p2", split_target_ratio=0.48),
)


def layout_report_to_two_pages(
    report_context: dict[str, Any],
    *,
    template_name: str,
    is_preschool: bool,
) -> dict[str, Any]:
    """Return a context distributed in exactly two pages.

    The function preserves the full text and validates with real PDF rendering
    when available, trying profile adjustments until the result is exactly
    two pages.
    """

    base_context = deepcopy(report_context)
    last_candidate = deepcopy(base_context)

    for profile in LAYOUT_PROFILES:
        candidate = _apply_two_page_layout(base_context, profile=profile, is_preschool=is_preschool)
        measured_candidate = _context_for_visual_measurement(candidate, is_preschool=is_preschool)
        try:
            pages = _count_pdf_pages(template_name=template_name, context=measured_candidate)
        except Exception:
            return _fallback_without_pdf_measurement(base_context, profile=profile, is_preschool=is_preschool)
        if pages == 2:
            return candidate
        last_candidate = candidate

    exact_candidate = _search_exact_two_page_layout(
        base_context,
        template_name=template_name,
        is_preschool=is_preschool,
    )
    if exact_candidate is not None:
        return exact_candidate

    # Final fallback: keep the densest readable profile, preserving full text.
    return last_candidate


def _count_pdf_pages(*, template_name: str, context: dict[str, Any]) -> int:
    html_string = render_to_string(template_name, context)
    pdf_bytes = render_pdf_bytes_from_html(html=html_string, base_url=str(settings.BASE_DIR))
    from pypdf import PdfReader  # noqa: PLC0415

    reader = PdfReader(BytesIO(pdf_bytes))
    return len(reader.pages)


def _fallback_without_pdf_measurement(
    context: dict[str, Any],
    *,
    profile: LayoutProfile,
    is_preschool: bool,
) -> dict[str, Any]:
    """Fallback for environments without PDF rendering dependencies."""

    return _apply_two_page_layout(context, profile=profile, is_preschool=is_preschool)


def _apply_two_page_layout(
    context: dict[str, Any],
    *,
    profile: LayoutProfile,
    is_preschool: bool,
) -> dict[str, Any]:
    optimized = deepcopy(context)
    optimized["report_layout"] = {
        "profile": profile.name,
        "target_pages": 2,
    }

    rows = optimized.get("rows") or []
    if not isinstance(rows, list) or not rows:
        optimized["rows_page_1"] = []
        optimized["rows_page_2"] = []
        return optimized

    split_index = _split_index_balanced(rows=rows, target_ratio=profile.split_target_ratio, is_preschool=is_preschool)
    optimized["rows_page_1"] = rows[:split_index]
    optimized["rows_page_2"] = rows[split_index:]

    if not optimized["rows_page_2"]:
        # Guarantee a two-page distribution even for very short reports.
        tail = optimized["rows_page_1"][-1:]
        optimized["rows_page_1"] = optimized["rows_page_1"][:-1]
        optimized["rows_page_2"] = tail

    if not optimized["rows_page_1"] and optimized["rows_page_2"]:
        optimized["rows_page_1"] = optimized["rows_page_2"][:1]
        optimized["rows_page_2"] = optimized["rows_page_2"][1:]

    return optimized


def _search_exact_two_page_layout(
    context: dict[str, Any],
    *,
    template_name: str,
    is_preschool: bool,
) -> dict[str, Any] | None:
    rows = context.get("rows") or []
    if not isinstance(rows, list) or len(rows) < 2:
        return None

    best_candidate: dict[str, Any] | None = None
    best_tuple: tuple[int, int, float, int] | None = None

    for profile_index, profile in enumerate(LAYOUT_PROFILES):
        blocks = _build_split_blocks(rows=rows, is_preschool=is_preschool)
        if len(blocks) < 2:
            continue

        candidate_splits = sorted(
            (blocks[idx].start for idx in range(1, len(blocks))),
            key=lambda split_index: _split_score_tuple(
                rows=rows,
                blocks=blocks,
                split_index=split_index,
                target_ratio=profile.split_target_ratio,
                is_preschool=is_preschool,
            ),
        )

        for split_index in candidate_splits:
            candidate = _apply_two_page_layout_with_split(context, profile=profile, split_index=split_index)
            measured_candidate = _context_for_visual_measurement(candidate, is_preschool=is_preschool)
            try:
                pages = _count_pdf_pages(template_name=template_name, context=measured_candidate)
            except Exception:
                return None

            score, balance, _ = _split_score_tuple(
                rows=rows,
                blocks=blocks,
                split_index=split_index,
                target_ratio=profile.split_target_ratio,
                is_preschool=is_preschool,
            )
            candidate_tuple = (pages, profile_index, int(score * 1000), split_index)

            if pages == 2:
                return candidate

            if best_tuple is None or candidate_tuple < best_tuple:
                best_tuple = candidate_tuple
                best_candidate = candidate

    return best_candidate


def _apply_two_page_layout_with_split(
    context: dict[str, Any],
    *,
    profile: LayoutProfile,
    split_index: int,
) -> dict[str, Any]:
    optimized = deepcopy(context)
    optimized["report_layout"] = {
        "profile": profile.name,
        "target_pages": 2,
    }

    rows = optimized.get("rows") or []
    optimized["rows_page_1"] = rows[:split_index]
    optimized["rows_page_2"] = rows[split_index:]

    if not optimized["rows_page_2"]:
        tail = optimized["rows_page_1"][-1:]
        optimized["rows_page_1"] = optimized["rows_page_1"][:-1]
        optimized["rows_page_2"] = tail

    if not optimized["rows_page_1"] and optimized["rows_page_2"]:
        optimized["rows_page_1"] = optimized["rows_page_2"][:1]
        optimized["rows_page_2"] = optimized["rows_page_2"][1:]

    return optimized


def _context_for_visual_measurement(context: dict[str, Any], *, is_preschool: bool) -> dict[str, Any]:
    measured = deepcopy(context)
    if is_preschool:
        return measured

    rows_page_1 = measured.get("rows_page_1") or []
    rows_page_2 = measured.get("rows_page_2") or []
    measured["rows_page_1"] = _group_rows_for_visual_blocks(rows_page_1)
    measured["rows_page_2"] = _group_rows_for_visual_blocks(rows_page_2)
    return measured


def _group_rows_for_visual_blocks(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: list[dict[str, Any]] = []
    idx = 0
    total = len(rows)

    while idx < total:
        row = rows[idx] if isinstance(rows[idx], dict) else None
        if not isinstance(row, dict):
            idx += 1
            continue

        row_type = str(row.get("row_type") or "").upper()
        if row_type == "AREA":
            subjects: list[dict[str, Any]] = []
            next_idx = idx + 1
            while next_idx < total:
                nxt = rows[next_idx] if isinstance(rows[next_idx], dict) else None
                if not isinstance(nxt, dict):
                    break
                nxt_type = str(nxt.get("row_type") or "").upper()
                if nxt_type != "SUBJECT" or bool(nxt.get("is_single_area")):
                    break
                subjects.append(nxt)
                next_idx += 1

            if subjects:
                block = dict(row)
                block["row_type"] = "AREA_COMPOSITE"
                block["subjects"] = subjects
                grouped.append(block)
                idx = next_idx
                continue

        grouped.append(row)
        idx += 1

    return grouped


def _split_index_balanced(*, rows: list[dict[str, Any]], target_ratio: float, is_preschool: bool) -> int:
    blocks = _build_split_blocks(rows=rows, is_preschool=is_preschool)
    if len(blocks) < 2:
        return 1 if rows else 0

    best_split = blocks[1].start
    best_tuple: tuple[float, float, int] | None = None

    for boundary_idx in range(1, len(blocks)):
        split_index = blocks[boundary_idx].start
        candidate_tuple = _split_score_tuple(
            rows=rows,
            blocks=blocks,
            split_index=split_index,
            target_ratio=target_ratio,
            is_preschool=is_preschool,
        )

        if best_tuple is None or candidate_tuple < best_tuple:
            best_tuple = candidate_tuple
            best_split = split_index

    return best_split


def _split_score_tuple(
    *,
    rows: list[dict[str, Any]],
    blocks: list[SplitBlock],
    split_index: int,
    target_ratio: float,
    is_preschool: bool,
) -> tuple[float, float, int]:
    total_weight = sum(block.weight for block in blocks)
    if total_weight <= 0:
        return (0.0, 0.0, split_index)

    target_weight = total_weight * target_ratio
    left_weight = sum(block.weight for block in blocks if block.end <= split_index)
    right_weight = total_weight - left_weight
    left_blocks = sum(1 for block in blocks if block.end <= split_index)
    right_blocks = len(blocks) - left_blocks

    score = abs(left_weight - target_weight)
    if not is_preschool and len(blocks) >= 4 and (left_blocks == 1 or right_blocks == 1):
        score += total_weight

    balance = abs(left_weight - right_weight)
    return (score, balance, split_index)


def _build_split_blocks(*, rows: list[dict[str, Any]], is_preschool: bool) -> list[SplitBlock]:
    blocks: list[SplitBlock] = []
    total = len(rows)
    idx = 0

    while idx < total:
        row = rows[idx]
        if not isinstance(row, dict):
            blocks.append(SplitBlock(start=idx, end=idx + 1, weight=1.0))
            idx += 1
            continue

        row_type = str(row.get("row_type") or "").upper()
        if not is_preschool and row_type == "AREA":
            end = idx + 1
            subject_count = 0
            while end < total:
                nxt = rows[end]
                if not isinstance(nxt, dict):
                    break
                nxt_type = str(nxt.get("row_type") or "").upper()
                if nxt_type == "SUBJECT" and not bool(nxt.get("is_single_area")):
                    subject_count += 1
                    end += 1
                    continue
                break

            if subject_count > 0:
                weight = 0.0
                for part_idx in range(idx, end):
                    part = rows[part_idx] if isinstance(rows[part_idx], dict) else {}
                    weight += _row_weight(row=part, is_preschool=is_preschool)
                blocks.append(SplitBlock(start=idx, end=end, weight=weight))
                idx = end
                continue

        blocks.append(
            SplitBlock(
                start=idx,
                end=idx + 1,
                weight=_row_weight(row=row, is_preschool=is_preschool),
            )
        )
        idx += 1

    return blocks


def _is_inside_compound_area(*, rows: list[dict[str, Any]], split_index: int) -> bool:
    return _compound_area_bounds_for_split(rows=rows, split_index=split_index) is not None


def _compound_area_bounds_for_split(
    *, rows: list[dict[str, Any]], split_index: int
) -> tuple[int, int] | None:
    """Return (area_start, area_end_exclusive) if split is inside a composite area."""

    if split_index <= 0 or split_index >= len(rows):
        return None

    idx = split_index - 1
    while idx >= 0:
        row = rows[idx]
        if not isinstance(row, dict):
            return None
        row_type = str(row.get("row_type") or "").upper()
        if row_type == "SUBJECT" and not bool(row.get("is_single_area")):
            idx -= 1
            continue
        break

    if idx < 0:
        return None

    area_row = rows[idx]
    if not isinstance(area_row, dict):
        return None
    if str(area_row.get("row_type") or "").upper() != "AREA":
        return None

    end = idx + 1
    subject_count = 0
    while end < len(rows):
        row = rows[end]
        if not isinstance(row, dict):
            break
        row_type = str(row.get("row_type") or "").upper()
        if row_type == "SUBJECT" and not bool(row.get("is_single_area")):
            subject_count += 1
            end += 1
            continue
        break

    if subject_count == 0:
        return None
    if idx < split_index < end:
        return idx, end
    return None


def _row_weight(*, row: dict[str, Any], is_preschool: bool) -> float:
    if not isinstance(row, dict):
        return 1.0

    row_type = str(row.get("row_type") or "").upper()
    if is_preschool:
        if row_type == "SUBJECT":
            return 1.1
        description = str(row.get("description") or "")
        return 0.9 + (len(description) / 140.0)

    if row_type == "AREA":
        return 1.0

    lines = row.get("lines") or []
    line_weight = 0.0
    if isinstance(lines, list):
        for line in lines:
            text = str(line or "")
            line_weight += 0.45 + (len(text) / 120.0)

    base = 1.2
    if bool(row.get("is_single_area")):
        base += 0.6
    return base + line_weight
