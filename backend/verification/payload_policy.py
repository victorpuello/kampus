from __future__ import annotations

from typing import Any

from .models import VerifiableDocument


def _mask_document_number(value: Any) -> str:
    """Returns a privacy-preserving representation for document numbers.

    Keeps only the last 4 characters (prefer digits when present).
    """

    raw = str(value or "").strip()
    if not raw:
        return ""

    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        tail = digits[-4:]
    else:
        tail = raw[-4:]

    if not tail:
        return ""

    return f"****{tail}"


_ALLOWED_PUBLIC_PAYLOAD_KEYS: dict[str, set[str]] = {
    VerifiableDocument.DocType.STUDY_CERTIFICATE: {
        "title",
        "student_full_name",
        "document_number",
        "academic_year",
        "grade_name",
        "rows",
        "final_status",
    },
    VerifiableDocument.DocType.STUDY_CERTIFICATION: {
        "title",
        "student_full_name",
        "document_number",
        "academic_year",
        "grade_name",
        "group_name",
    },
    VerifiableDocument.DocType.REPORT_CARD: {
        "title",
        "student_name",
        "group_name",
        "period_name",
        "year_name",
        "rows",
        "final_status",
    },
    VerifiableDocument.DocType.OBSERVER_REPORT: {
        "title",
        "student_full_name",
        "document_number",
        "observer_number",
        "academic_year",
    },
}


def sanitize_public_payload(doc_type: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    """Whitelists and normalizes the public payload.

    This is the last line of defense to prevent leaking sensitive fields.
    """

    if not isinstance(payload, dict):
        payload = {}

    allowed = _ALLOWED_PUBLIC_PAYLOAD_KEYS.get(str(doc_type) or "", {"title"})

    sanitized: dict[str, Any] = {}
    for key in allowed:
        if key not in payload:
            continue

        value = payload.get(key)
        if key == "document_number":
            masked = _mask_document_number(value)
            if masked:
                sanitized[key] = masked
            continue

        if isinstance(value, str):
            value = value.strip()
            if value:
                sanitized[key] = value
            continue

        if isinstance(value, (int, float, bool)) or value is None:
            sanitized[key] = value
            continue

        if key == "rows" and doc_type == VerifiableDocument.DocType.STUDY_CERTIFICATE:
            if isinstance(value, list):
                out_rows: list[dict[str, Any]] = []
                for item in value[:80]:
                    if not isinstance(item, dict):
                        continue

                    row: dict[str, Any] = {}
                    for rk in ("area_subject", "hours_per_week", "score", "performance"):
                        rv = item.get(rk)
                        if isinstance(rv, str):
                            rv = rv.strip()
                        if rk == "hours_per_week":
                            try:
                                rv = int(rv)
                            except Exception:
                                rv = 0
                        if rv is None:
                            continue
                        row[rk] = rv

                    if row:
                        out_rows.append(row)

                if out_rows:
                    sanitized[key] = out_rows
            continue

        if key == "rows" and doc_type == VerifiableDocument.DocType.REPORT_CARD:
            if isinstance(value, list):
                out_rows: list[dict[str, Any]] = []
                allowed_row_keys = (
                    "row_type",
                    "title",
                    "label",
                    "absences",
                    "p1_score",
                    "p2_score",
                    "p3_score",
                    "p4_score",
                    "final_score",
                    "p1_scale",
                    "p2_scale",
                    "p3_scale",
                    "p4_scale",
                    "final_scale",
                )

                for item in value[:80]:
                    if not isinstance(item, dict):
                        continue

                    row: dict[str, Any] = {}
                    for rk in allowed_row_keys:
                        rv = item.get(rk)
                        if isinstance(rv, str):
                            rv = rv.strip()
                        if rv is None or rv == "":
                            continue
                        if isinstance(rv, (int, float, bool)):
                            row[rk] = rv
                            continue
                        if isinstance(rv, str):
                            row[rk] = rv
                            continue

                    if row:
                        out_rows.append(row)

                if out_rows:
                    sanitized[key] = out_rows
            continue

        # Drop nested structures and unknown types.

    # Ensure title is a string (or omit).
    title = sanitized.get("title")
    if title is not None and not isinstance(title, str):
        sanitized.pop("title", None)

    return sanitized
