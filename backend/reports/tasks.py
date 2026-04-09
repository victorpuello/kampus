from __future__ import annotations

import ast
import base64
import html as html_lib
import logging
import time
import re
import json
import unicodedata
from urllib.parse import urljoin, urlparse
from datetime import date, datetime
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.template.loader import render_to_string

from academic.models import Period
from academic.reports import build_grade_report_sheet_context
from academic.reports import build_commitment_acta_context, build_commission_group_acta_context
from academic.ai import AIService, AIServiceError
from students.academic_period_report import (
    build_academic_period_group_report_context,
    build_academic_period_report_context,
    build_preschool_academic_period_group_report_context,
    build_preschool_academic_period_report_context,
    group_report_rows_for_visual_blocks,
)
from students.single_page_report_fit import layout_report_to_two_pages
from students.academic_period_sabana_report import build_academic_period_sabana_context
from students.models import Enrollment

from attendance.reports import build_attendance_manual_sheet_context
from discipline.reports import build_case_acta_context
from students.reports import build_enrollment_list_report_context, build_family_directory_by_group_report_context

from .models import ReportJob
from .weasyprint_utils import PDF_BASE_CSS, weasyprint_url_fetcher


logger = logging.getLogger(__name__)


def _build_class_plan_pdf_filename(plan) -> str:
    topic_source = getattr(getattr(plan, "topic", None), "title", "") or getattr(plan, "title", "") or "tema"
    normalized = unicodedata.normalize("NFKD", str(topic_source or "").strip())
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    stopwords = {"a", "al", "con", "de", "del", "el", "en", "la", "las", "los", "para", "por", "sus", "un", "una", "y"}
    words = [word for word in re.findall(r"[A-Za-z0-9]+", normalized) if word.lower() not in stopwords]
    clipped_words = words[:3] or ["tema"]
    topic_fragment = "_".join(word.capitalize() for word in clipped_words)

    plan_date = getattr(plan, "class_date", None)
    if hasattr(plan_date, "strftime"):
        date_fragment = plan_date.strftime("%Y-%m-%d")
    else:
        created_at = getattr(plan, "created_at", None)
        if hasattr(created_at, "strftime"):
            date_fragment = created_at.strftime("%Y-%m-%d")
        else:
            date_fragment = date.today().strftime("%Y-%m-%d")

    return f"Plan_de_Clase_{topic_fragment}_{date_fragment}.pdf"


def _normalize_pdf_text(value) -> str:
    def _to_lines(raw_value) -> list[str]:
        if raw_value is None:
            return []
        if isinstance(raw_value, (list, tuple, set)):
            lines: list[str] = []
            for item in raw_value:
                text = _normalize_pdf_text(item)
                if text:
                    lines.extend([part for part in text.splitlines() if part.strip()])
            return lines
        if isinstance(raw_value, dict):
            lines = []
            for key, item in raw_value.items():
                text = _normalize_pdf_text(item)
                if text:
                    lines.append(f"{key}: {text}")
            return lines

        text = str(raw_value or "").strip()
        if not text:
            return []

        parsed = None
        if text.startswith(("[", "{")) and text.endswith(("]", "}")):
            try:
                parsed = json.loads(text)
            except Exception:
                try:
                    parsed = ast.literal_eval(text)
                except Exception:
                    parsed = None
        if parsed is not None and parsed != raw_value:
            return _to_lines(parsed)

        text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE)
        text = text.replace("```", "")
        text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
        text = re.sub(r"__(.*?)__", r"\1", text)
        text = re.sub(r"`([^`]+)`", r"\1", text)

        normalized_lines: list[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                if normalized_lines and normalized_lines[-1] != "":
                    normalized_lines.append("")
                continue
            stripped = re.sub(r"^[\-*•\u2022]+\s*", "- ", stripped)
            stripped = re.sub(r"^\d+[\.)]\s*", "- ", stripped)
            stripped = stripped.strip("[]'\"")
            stripped = re.sub(r"\s+", " ", stripped).strip()
            normalized_lines.append(stripped)

        while normalized_lines and normalized_lines[-1] == "":
            normalized_lines.pop()
        return normalized_lines

    lines = _to_lines(value)
    if not lines:
        return ""

    compacted: list[str] = []
    previous_blank = False
    for line in lines:
        is_blank = not line.strip()
        if is_blank:
            if not previous_blank and compacted:
                compacted.append("")
            previous_blank = True
            continue
        compacted.append(line)
        previous_blank = False
    return "\n".join(compacted).strip()


def _text_to_pdf_html(value) -> str:
    cleaned = _normalize_pdf_text(value)
    if not cleaned:
        return ""

    title_re = re.compile(r"^[A-ZÁÉÍÓÚÑa-záéíóúñ][^\n]{0,120}:$")
    html_parts: list[str] = []
    in_list = False
    paragraph_buffer: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        if not paragraph_buffer:
            return
        paragraph_text = " ".join(part.strip() for part in paragraph_buffer if part.strip())
        if paragraph_text:
            html_parts.append(f"<p>{html_lib.escape(paragraph_text)}</p>")
        paragraph_buffer = []

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            html_parts.append("</ul>")
            in_list = False

    for raw_line in cleaned.splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            close_list()
            continue

        if title_re.match(line):
            flush_paragraph()
            close_list()
            html_parts.append(f"<p class=\"rich-subtitle\">{html_lib.escape(line)}</p>")
            continue

        if line.startswith("- "):
            flush_paragraph()
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            html_parts.append(f"<li>{html_lib.escape(line[2:].strip())}</li>")
            continue

        close_list()
        paragraph_buffer.append(line)

    flush_paragraph()
    close_list()
    return "".join(html_parts)


def _build_class_plan_pdf_context(*, institution, plan) -> dict:
    cleaned_fields = {
        "learning_result": _normalize_pdf_text(plan.learning_result),
        "dba_reference": _normalize_pdf_text(plan.dba_reference),
        "standard_reference": _normalize_pdf_text(plan.standard_reference),
        "competency_know": _normalize_pdf_text(plan.competency_know),
        "competency_do": _normalize_pdf_text(plan.competency_do),
        "competency_be": _normalize_pdf_text(plan.competency_be),
        "class_purpose": _normalize_pdf_text(plan.class_purpose),
        "start_activities": _normalize_pdf_text(plan.start_activities),
        "development_activities": _normalize_pdf_text(plan.development_activities),
        "closing_activities": _normalize_pdf_text(plan.closing_activities),
        "evidence_product": _normalize_pdf_text(plan.evidence_product),
        "evaluation_instrument": _normalize_pdf_text(plan.evaluation_instrument),
        "evaluation_criterion": _normalize_pdf_text(plan.evaluation_criterion),
        "resources": _normalize_pdf_text(plan.resources),
        "dua_adjustments": _normalize_pdf_text(plan.dua_adjustments),
    }
    html_fields = {key: _text_to_pdf_html(value) for key, value in cleaned_fields.items()}
    return {
        "institution": institution,
        "plan": plan,
        "plan_display": cleaned_fields,
        "plan_html": html_fields,
        "teacher_name": _normalize_pdf_text(getattr(plan.teacher_assignment.teacher, "get_full_name", lambda: "")()),
        "subject_name": _normalize_pdf_text(getattr(plan.teacher_assignment.academic_load.subject, "name", "")),
        "area_name": _normalize_pdf_text(getattr(getattr(plan.teacher_assignment.academic_load.subject, "area", None), "name", "")),
        "grade_name": _normalize_pdf_text(getattr(plan.teacher_assignment.group.grade, "name", "")),
        "group_name": _normalize_pdf_text(getattr(plan.teacher_assignment.group, "name", "")),
        "period_name": _normalize_pdf_text(getattr(plan.period, "name", "")),
        "topic_title": _normalize_pdf_text(getattr(getattr(plan, "topic", None), "title", "") or plan.title),
    }


def _resolve_group_acta_ai_blocks_for_job(*, commission) -> dict:
    default_payload = {
        "executive_summary": (
            "La comisión consolidó el análisis académico del grupo y priorizó intervenciones sobre los casos "
            "con mayor nivel de riesgo para fortalecer el desempeño en el siguiente corte."
        ),
        "general_observations": [
            "Fortalecer procesos de acompañamiento pedagógico y planes de mejora individual.",
            "Dar seguimiento continuo desde dirección de grupo y orientación escolar.",
            "Priorizar remisión al comité de apoyo pedagógico en casos de alto riesgo.",
        ],
        "agreed_commitments": [
            "Docentes: implementar estrategias remediales por competencias críticas.",
            "Directores de grupo: realizar seguimiento individual a estudiantes en riesgo.",
            "Familias: asistir a reuniones de seguimiento y verificar cumplimiento de planes.",
        ],
        "institutional_commitments": [
            "Docentes: implementar estrategias remediales por competencias críticas.",
            "Directores de grupo: realizar seguimiento individual a estudiantes en riesgo.",
            "Familias: asistir a reuniones de seguimiento y verificar cumplimiento de planes.",
        ],
    }

    group = commission.group
    institution_name = getattr(getattr(commission, "institution", None), "name", "") or "Institución Educativa"
    grade_name = getattr(getattr(group, "grade", None), "name", "") if group else ""
    group_name = getattr(group, "name", "") if group else ""
    grade_group_label = f"{grade_name} ({group_name})" if grade_name and group_name else (grade_name or group_name or "General")
    period_name = getattr(getattr(commission, "period", None), "name", "") if commission.period_id else "Cierre anual"
    total_students = commission.student_decisions.count()
    flagged_count = commission.student_decisions.filter(is_flagged=True).count()
    pending_count = commission.student_decisions.filter(
        is_flagged=True,
        decision__in=["PENDING", "FOLLOW_UP"],
    ).count()
    reprobated_count = max(0, flagged_count - pending_count)

    context = {
        "institution_name": institution_name,
        "commission_type": commission.commission_type,
        "grade_group": grade_group_label,
        "period_name": period_name,
        "totals": {
            "total_students": int(total_students),
            "flagged_count": int(flagged_count),
            "pending_count": int(pending_count),
            "reprobated_count": int(reprobated_count),
        },
    }

    try:
        payload = AIService().generate_commission_group_acta_blocks(context)
    except AIServiceError:
        return default_payload
    except Exception:
        logger.exception("Unexpected error generating group commission acta AI blocks")
        return default_payload

    if not isinstance(payload, dict):
        return default_payload
    executive_summary = str(payload.get("executive_summary") or "").strip()
    observations = payload.get("general_observations")
    commitments = payload.get("agreed_commitments")
    if not isinstance(observations, list):
        observations = payload.get("institutional_observations")
    if not isinstance(commitments, list):
        commitments = payload.get("institutional_commitments")
    if not executive_summary or not isinstance(observations, list) or not isinstance(commitments, list):
        return default_payload

    clean_observations = [str(item).strip() for item in observations if str(item).strip()]
    clean_commitments = [str(item).strip() for item in commitments if str(item).strip()]
    if not clean_observations or not clean_commitments:
        return default_payload

    return {
        "executive_summary": executive_summary,
        "general_observations": clean_observations,
        "agreed_commitments": clean_commitments,
        "institutional_commitments": clean_commitments,
    }


def _safe_join_private(root: Path, relpath: str) -> Path:
    # Prevent path traversal. Force relative path and ensure it's under root.
    rel = Path(relpath)
    if rel.is_absolute():
        raise ValueError("Absolute paths are not allowed")

    final = (root / rel).resolve()
    root_resolved = root.resolve()
    if root_resolved not in final.parents and final != root_resolved:
        raise ValueError("Invalid path")
    return final


def _image_file_to_data_uri(image_field) -> str:
    """Convert a Django ImageField to a base64 data URI for embedding in HTML."""
    import mimetypes  # noqa: PLC0415
    if not image_field or not getattr(image_field, "name", None):
        return ""
    try:
        mime = mimetypes.guess_type(image_field.name)[0] or "image/jpeg"
        with open(image_field.path, "rb") as fh:
            data = base64.b64encode(fh.read()).decode("ascii")
        return f"data:{mime};base64,{data}"
    except Exception:
        return ""


def _image_field_to_thumbnail_data_uri(image_field, max_w: int = 120, max_h: int = 150, quality: int = 55) -> str:
    """Like _image_file_to_data_uri but resizes+compresses with Pillow to keep HTML small."""
    if not image_field or not getattr(image_field, "name", None):
        return ""
    try:
        from PIL import Image  # noqa: PLC0415
        import io  # noqa: PLC0415
        with Image.open(image_field.path) as img:
            img = img.convert("RGB")
            img.thumbnail((max_w, max_h), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            data = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{data}"
    except Exception:
        return ""


def _qr_png_data_uri_small(text: str, box_size: int = 4, border: int = 2) -> str:
    """Generate a compact QR code PNG data URI (smaller box_size than default)."""
    try:
        import qrcode  # noqa: PLC0415
        from qrcode.constants import ERROR_CORRECT_M  # noqa: PLC0415
        from io import BytesIO  # noqa: PLC0415

        qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=box_size, border=border)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception:
        return ""


def _render_election_census_qr_html(job: ReportJob) -> str:
    """Render carnets electorales as premium ID cards (no tables)."""
    from core.models import Institution  # noqa: PLC0415
    from students.models import Student  # noqa: PLC0415
    from academic.models import AcademicYear  # noqa: PLC0415
    from django.utils import timezone as tz  # noqa: PLC0415

    params = job.params or {}
    process_name = str(params.get("process_name") or "Proceso Electoral")
    group_filter = str(params.get("group_filter") or "")
    year_label = str(params.get("year_label") or "")
    rows_data: list[dict] = params.get("rows_data") or []

    institution = Institution.objects.order_by("id").first()
    institution_name = str(institution.name) if institution else "Institución Educativa"
    institution_logo_src = _image_field_to_thumbnail_data_uri(
        getattr(institution, "logo", None), max_w=72, max_h=72, quality=85
    ) if institution else ""

    if not year_label:
        active_year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).order_by("-year", "-id").only("year").first()
        year_label = str(active_year.year) if active_year else str(tz.now().year)

    student_ids = [r["student_id"] for r in rows_data if r.get("student_id")]
    students_by_id: dict[int, Student] = {}
    if student_ids:
        for student in Student.objects.filter(user_id__in=student_ids).only("user_id", "photo", "photo_thumb"):
            students_by_id[student.user_id] = student

    qr_cache: dict[str, str] = {}

    def _get_qr(code: str) -> str:
        if code not in qr_cache:
            qr_cache[code] = _qr_png_data_uri_small(code, box_size=6, border=1)
        return qr_cache[code]

    css = (
        "* { box-sizing: border-box; margin: 0; padding: 0; }"
        "@page { size: A4 portrait; margin: 6mm; }"
        "body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #dbe5f2; }"
        "h1.doc-title { font-size: 10pt; color: #102f56; font-weight: bold; margin-bottom: 0.6mm; }"
        "p.meta { font-size: 6.2pt; color: #4a5d74; margin-bottom: 3mm; }"
        ".cards { font-size: 0; }"
        ".card-shell { display: inline-block; width: 62mm; margin-right: 3mm; margin-bottom: 3mm; vertical-align: top; page-break-inside: avoid; }"
        ".card-shell:nth-child(3n) { margin-right: 0; }"
        ".card { background: #ffffff; border: 0.7pt solid #9eb2ca; }"
        ".top { background: #0f2d57; padding: 1.7mm 2mm 1.8mm 2mm; }"
        ".logo-box { float: left; width: 9mm; height: 9mm; margin-right: 1.3mm; }"
        ".logo-box img { display: block; width: 9mm; height: 9mm; object-fit: contain; }"
        ".logo-ph { width: 9mm; height: 9mm; border: 0.4pt dashed #9db7da; color: #9db7da; text-align: center; font-size: 5pt; line-height: 8.5mm; }"
        ".top-txt { overflow: hidden; min-height: 9mm; }"
        ".inst { color: #f3f7ff; font-size: 5.3pt; font-weight: bold; text-transform: uppercase; line-height: 1.22; letter-spacing: 0.12pt; }"
        ".sub { color: #bdd3f7; font-size: 4.5pt; margin-top: 0.25mm; }"
        ".stripe { height: 1.4mm; background: #d97706; font-size: 0; line-height: 0; }"
        ".body { padding: 1.9mm 2mm 1.2mm 2mm; }"
        ".photo-col { float: left; width: 15mm; }"
        ".photo { width: 14mm; height: 18.8mm; border: 0.45pt solid #b6c7dc; object-fit: cover; display: block; }"
        ".photo-ph { width: 14mm; height: 18.8mm; border: 0.55pt dashed #9aaec6; color: #8196ad; background: #f0f5fc; text-align: center; font-size: 10pt; padding-top: 3.2mm; display: block; }"
        ".year-chip { margin-top: 0.55mm; width: 14mm; background: #0f2d57; color: #d9e7fb; text-align: center; font-size: 4.1pt; font-weight: bold; padding: 0.45mm 0; letter-spacing: 0.25pt; }"
        ".info-col { margin-left: 16mm; }"
        ".name { font-size: 6.25pt; font-weight: bold; text-transform: uppercase; color: #122f56; line-height: 1.22; border-bottom: 0.45pt solid #dbe4f0; padding-bottom: 0.8mm; margin-bottom: 0.8mm; }"
        ".pill { display: inline-block; background: #eaf1fb; border: 0.45pt solid #c6d6e8; color: #1a3b68; font-size: 4.9pt; font-weight: bold; padding: 0.35mm 0.9mm; margin-bottom: 0.6mm; }"
        ".line { font-size: 5.1pt; color: #33475d; line-height: 1.42; margin-bottom: 0.25mm; }"
        ".lbl { color: #5d738b; font-size: 4.35pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08pt; }"
        ".clr { clear: both; }"
        ".foot { border-top: 0.6pt solid #cad7e6; background: #edf3fb; padding: 1.05mm 2mm 1.2mm 2mm; }"
        ".code-wrap { float: left; width: 70%; }"
        ".code-lbl { font-size: 4pt; color: #8c9eb4; text-transform: uppercase; letter-spacing: 0.34pt; margin-bottom: 0.25mm; }"
        ".code { font-size: 7.6pt; font-weight: bold; color: #112f57; font-family: 'Courier New', monospace; letter-spacing: 0.45pt; line-height: 1.2; }"
        ".qr-wrap { float: right; width: 16mm; text-align: right; }"
        ".qr-wrap img { width: 15mm; height: 15mm; display: block; margin-left: auto; }"
    )

    institution_name_esc = html_lib.escape(institution_name)
    process_name_esc = html_lib.escape(process_name)
    group_label_esc = html_lib.escape(group_filter or "Todos")

    cards: list[str] = []
    for row in rows_data:
        manual_code = str(row.get("manual_code") or "")
        qr_src = _get_qr(manual_code)

        full_name = html_lib.escape(str(row.get("full_name") or "Estudiante"))
        grade = html_lib.escape(str(row.get("grade") or "—"))
        group = html_lib.escape(str(row.get("group") or "—"))
        document_number = html_lib.escape(str(row.get("document_number") or "—"))
        shift = html_lib.escape(str(row.get("shift") or ""))
        campus_name = html_lib.escape(str(row.get("campus") or ""))
        code_esc = html_lib.escape(manual_code)

        student = students_by_id.get(row.get("student_id")) if row.get("student_id") else None
        photo_src = ""
        if student:
            photo_src = _image_field_to_thumbnail_data_uri(
                student.photo_thumb if student.photo_thumb else student.photo,
                max_w=140,
                max_h=180,
                quality=82,
            )

        if photo_src:
            photo_block = f'<img src="{photo_src}" class="photo" alt=""/>'
        else:
            photo_block = '<div class="photo-ph">&#128100;</div>'

        if institution_logo_src:
            logo_block = f'<div class="logo-box"><img src="{institution_logo_src}" alt=""/></div>'
        else:
            logo_block = '<div class="logo-box"><div class="logo-ph">IE</div></div>'

        shift_line = f'<div class="line"><span class="lbl">Jornada:</span> {shift}</div>' if shift else ""
        campus_line = f'<div class="line"><span class="lbl">Sede:</span> {campus_name}</div>' if campus_name else ""
        qr_block = f'<div class="qr-wrap"><img src="{qr_src}" alt=""/></div>' if qr_src else '<div class="qr-wrap"></div>'

        card = (
            '<div class="card-shell"><div class="card">'
            '<div class="top">'
            + logo_block
            + '<div class="top-txt">'
            + f'<div class="inst">{institution_name_esc}</div>'
            + '<div class="sub">Carn&#233; Electoral &middot; Gobierno Escolar</div>'
            + '</div><div class="clr"></div>'
            + '</div>'
            + '<div class="stripe"></div>'
            + '<div class="body">'
            + f'<div class="photo-col">{photo_block}<div class="year-chip">{html_lib.escape(year_label)}</div></div>'
            + '<div class="info-col">'
            + f'<div class="name">{full_name}</div>'
            + f'<div class="pill">Grado {grade} · Grupo {group}</div>'
            + shift_line
            + campus_line
            + f'<div class="line"><span class="lbl">Documento:</span> {document_number}</div>'
            + '</div><div class="clr"></div>'
            + '</div>'
            + '<div class="foot">'
            + '<div class="code-wrap"><div class="code-lbl">C&#243;digo de votaci&#243;n</div>'
            + f'<div class="code">{code_esc}</div></div>'
            + qr_block
            + '<div class="clr"></div></div>'
            + '</div></div>'
        )
        cards.append(card)

    return (
        "<!doctype html><html><head><meta charset='utf-8'/>"
        "<title>Carn&#233;s Gobierno Escolar</title>"
        f"<style>{css}</style>"
        "</head><body>"
        f"<h1 class='doc-title'>Carn&#233;s electorales &middot; {process_name_esc}</h1>"
        f"<p class='meta'>Grupo: {group_label_esc} &nbsp;&middot;&nbsp; Generado: {tz.now().strftime('%d/%m/%Y %H:%M')}</p>"
        f"<div class='cards'>{''.join(cards)}</div>"
        "</body></html>"
    )


def _render_report_html(job: ReportJob) -> str:
    if job.report_type == ReportJob.ReportType.DUMMY:
        from core.models import Institution  # noqa: PLC0415

        institution = Institution.objects.first() or Institution(name="")
        return render_to_string(
            "reports/dummy_report.html",
            {
                "job": job,
                "user": job.created_by,
                "params": job.params,
                "institution": institution,
            },
        )

    if job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_ENROLLMENT:
        enrollment_id = (job.params or {}).get("enrollment_id")
        period_id = (job.params or {}).get("period_id")

        enrollment = Enrollment.objects.select_related(
            "student",
            "student__user",
            "grade",
            "grade__level",
            "group",
            "group__grade",
            "group__grade__level",
            "group__director",
            "academic_year",
        ).get(id=enrollment_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.services import build_public_verify_url, get_or_create_for_report_job  # noqa: PLC0415

        level_type = None
        try:
            level_type = getattr(getattr(getattr(enrollment.grade, "level", None), "level_type", None), "upper", lambda: None)()
        except Exception:
            level_type = None
        if not level_type:
            try:
                level_type = getattr(
                    getattr(getattr(getattr(enrollment.group, "grade", None), "level", None), "level_type", None),
                    "upper",
                    lambda: None,
                )()
            except Exception:
                level_type = None

        is_preschool = level_type in {"PRESCHOOL", "PREESCOLAR"}
        if is_preschool:
            ctx = build_preschool_academic_period_report_context(enrollment=enrollment, period=period)
        else:
            ctx = build_academic_period_report_context(enrollment=enrollment, period=period)

        ctx = layout_report_to_two_pages(
            ctx,
            template_name=(
                "students/reports/academic_period_report_preschool_pdf.html"
                if is_preschool
                else "students/reports/academic_period_report_pdf.html"
            ),
            is_preschool=is_preschool,
        )
        if not is_preschool:
            ctx["rows_page_1"] = group_report_rows_for_visual_blocks(ctx.get("rows_page_1") or [])
            ctx["rows_page_2"] = group_report_rows_for_visual_blocks(ctx.get("rows_page_2") or [])

        rows_public = []
        for r in (ctx.get("rows") or [])[:80]:
            if not isinstance(r, dict):
                continue
            if is_preschool:
                row_type = str(r.get("row_type") or "").strip().upper()
                if row_type in {"SUBJECT", "DIMENSION"}:
                    rows_public.append({"row_type": row_type, "title": r.get("title", "")})
                else:
                    rows_public.append(
                        {
                            "row_type": "ACHIEVEMENT",
                            "title": r.get("description", "") or r.get("title", ""),
                            "label": r.get("label", ""),
                        }
                    )
            else:
                rows_public.append(
                    {
                        "title": r.get("title", ""),
                        "absences": r.get("absences", ""),
                        "p1_score": r.get("p1_score", ""),
                        "p2_score": r.get("p2_score", ""),
                        "p3_score": r.get("p3_score", ""),
                        "p4_score": r.get("p4_score", ""),
                        "final_score": r.get("final_score", ""),
                        "p1_scale": r.get("p1_scale", ""),
                        "p2_scale": r.get("p2_scale", ""),
                        "p3_scale": r.get("p3_scale", ""),
                        "p4_scale": r.get("p4_scale", ""),
                        "final_scale": r.get("final_scale", ""),
                    }
                )

        vdoc = get_or_create_for_report_job(
            job_id=job.id,
            doc_type=VerifiableDocument.DocType.REPORT_CARD,
            public_payload={
                "title": f"Boletín / Informe académico: {ctx.get('student_name','').strip()} - {ctx.get('period_name','').strip()} - {ctx.get('year_name','')}",
                "student_name": ctx.get("student_name", ""),
                "group_name": ctx.get("group_name", ""),
                "period_name": ctx.get("period_name", ""),
                "year_name": ctx.get("year_name", ""),
                "rows": rows_public,
                "final_status": getattr(enrollment, "final_status", "") or "",
            },
        )
        verify_url = _coerce_public_absolute_url(job, build_public_verify_url(vdoc.token))
        verify_url_prefix = ""
        try:
            marker = f"{vdoc.token}/"
            if verify_url and marker in verify_url:
                verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
        except Exception:
            verify_url_prefix = ""
        ctx["verify_url"] = verify_url
        ctx["verify_token"] = vdoc.token
        ctx["verify_url_prefix"] = verify_url_prefix
        ctx["qr_image_src"] = _qr_png_data_uri(verify_url) if verify_url else ""
        if is_preschool:
            return render_to_string("students/reports/academic_period_report_preschool_pdf.html", ctx)
        return render_to_string("students/reports/academic_period_report_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_GROUP:
        from academic.models import Group  # noqa: PLC0415

        group_id = (job.params or {}).get("group_id")
        period_id = (job.params or {}).get("period_id")

        group = Group.objects.select_related("academic_year", "director", "grade", "grade__level").get(id=group_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        group_level_type = None
        try:
            group_level_type = getattr(getattr(getattr(group.grade, "level", None), "level_type", None), "upper", lambda: None)()
        except Exception:
            group_level_type = None

        is_preschool_group = group_level_type in {"PRESCHOOL", "PREESCOLAR"}

        enrollments = (
            Enrollment.objects.select_related(
                "student",
                "student__user",
                "grade",
                "grade__level",
                "group",
                "group__director",
                "academic_year",
            )
            .filter(group_id=group.id, academic_year_id=period.academic_year_id, status="ACTIVE")
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )
        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.payload_policy import sanitize_public_payload  # noqa: PLC0415
        from verification.services import build_public_verify_url  # noqa: PLC0415

        if is_preschool_group:
            ctx = build_preschool_academic_period_group_report_context(enrollments=enrollments, period=period)
        else:
            ctx = build_academic_period_group_report_context(enrollments=enrollments, period=period)

        pages_to_fit = ctx.get("pages") or []
        if isinstance(pages_to_fit, list):
            fitted_pages = []
            for page in pages_to_fit:
                if not isinstance(page, dict):
                    continue
                fitted_pages.append(
                    layout_report_to_two_pages(
                        page,
                        template_name=(
                            "students/reports/academic_period_report_preschool_pdf.html"
                            if is_preschool_group
                            else "students/reports/academic_period_report_pdf.html"
                        ),
                        is_preschool=is_preschool_group,
                    )
                )
                if not is_preschool_group and fitted_pages:
                    fitted_pages[-1]["rows_page_1"] = group_report_rows_for_visual_blocks(
                        fitted_pages[-1].get("rows_page_1") or []
                    )
                    fitted_pages[-1]["rows_page_2"] = group_report_rows_for_visual_blocks(
                        fitted_pages[-1].get("rows_page_2") or []
                    )
            ctx["pages"] = fitted_pages

        # One verification token per student/page.
        pages = ctx.get("pages") or []
        if isinstance(pages, list):
            for page in pages:
                if not isinstance(page, dict):
                    continue

                enrollment_id = page.get("enrollment_id")
                object_id = f"{job.id}:enrollment:{enrollment_id}" if enrollment_id else f"{job.id}:student:{page.get('student_code','')}"

                rows_public = []
                for r in (page.get("rows") or [])[:80]:
                    if not isinstance(r, dict):
                        continue

                    if is_preschool_group:
                        row_type = str(r.get("row_type") or "").strip().upper()
                        if row_type in {"SUBJECT", "DIMENSION"}:
                            rows_public.append({"row_type": row_type, "title": r.get("title", "")})
                        else:
                            rows_public.append(
                                {
                                    "row_type": "ACHIEVEMENT",
                                    "title": r.get("description", "") or r.get("title", ""),
                                    "label": r.get("label", ""),
                                }
                            )
                    else:
                        rows_public.append(
                            {
                                "title": r.get("title", ""),
                                "absences": r.get("absences", ""),
                                "p1_score": r.get("p1_score", ""),
                                "p2_score": r.get("p2_score", ""),
                                "p3_score": r.get("p3_score", ""),
                                "p4_score": r.get("p4_score", ""),
                                "final_score": r.get("final_score", ""),
                                "p1_scale": r.get("p1_scale", ""),
                                "p2_scale": r.get("p2_scale", ""),
                                "p3_scale": r.get("p3_scale", ""),
                                "p4_scale": r.get("p4_scale", ""),
                                "final_scale": r.get("final_scale", ""),
                            }
                        )

                public_payload = sanitize_public_payload(
                    VerifiableDocument.DocType.REPORT_CARD,
                    {
                        "title": f"Boletín / Informe académico: {str(page.get('student_name','')).strip()} - {str(page.get('period_name','')).strip()} - {str(page.get('year_name','')).strip()}",
                        "student_name": page.get("student_name", ""),
                        "group_name": page.get("group_name", ""),
                        "period_name": page.get("period_name", ""),
                        "year_name": page.get("year_name", ""),
                        "rows": rows_public,
                        "final_status": page.get("final_status", ""),
                    },
                )

                vdoc = VerifiableDocument.objects.filter(
                    doc_type=VerifiableDocument.DocType.REPORT_CARD,
                    object_type="ReportJobPage",
                    object_id=str(object_id),
                ).first()
                if vdoc:
                    if public_payload and (vdoc.public_payload or {}) != public_payload:
                        vdoc.public_payload = public_payload
                        vdoc.save(update_fields=["public_payload", "updated_at"])
                else:
                    vdoc = VerifiableDocument.create_with_unique_token(
                        doc_type=VerifiableDocument.DocType.REPORT_CARD,
                        public_payload=public_payload,
                        object_type="ReportJobPage",
                        object_id=str(object_id),
                    )

                verify_url = _coerce_public_absolute_url(job, build_public_verify_url(vdoc.token))
                verify_url_prefix = ""
                try:
                    marker = f"{vdoc.token}/"
                    if verify_url and marker in verify_url:
                        verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
                except Exception:
                    verify_url_prefix = ""

                page["verify_url"] = verify_url
                page["verify_token"] = vdoc.token
                page["verify_url_prefix"] = verify_url_prefix
                page["qr_image_src"] = _qr_png_data_uri(verify_url) if verify_url else ""

        if is_preschool_group:
            return render_to_string("students/reports/academic_period_report_group_preschool_pdf.html", ctx)
        return render_to_string("students/reports/academic_period_report_group_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_SABANA:
        from academic.models import Group  # noqa: PLC0415

        group_id = (job.params or {}).get("group_id")
        period_id = (job.params or {}).get("period_id")

        group = Group.objects.select_related("academic_year", "director", "grade").get(id=group_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        ctx = build_academic_period_sabana_context(group=group, period=period)
        return render_to_string("students/reports/academic_period_sabana_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.DISCIPLINE_CASE_ACTA:
        from discipline.models import DisciplineCase  # noqa: PLC0415

        case_id = (job.params or {}).get("case_id")
        case = DisciplineCase.objects.get(id=case_id)
        ctx = build_case_acta_context(case=case, generated_by=job.created_by)
        return render_to_string("discipline/case_acta.html", ctx)

    if job.report_type == ReportJob.ReportType.ACADEMIC_COMMISSION_ACTA:
        from academic.models import CommissionStudentDecision  # noqa: PLC0415

        decision_id = (job.params or {}).get("decision_id")
        decision = (
            CommissionStudentDecision.objects.select_related(
                "commission",
                "commission__period",
                "commission__academic_year",
                "enrollment",
                "enrollment__student",
                "enrollment__student__user",
                "enrollment__grade",
                "enrollment__group",
                "enrollment__group__director",
                "enrollment__campus",
                "enrollment__campus__institution",
                "commitment_acta",
            )
            .get(id=decision_id)
        )
        ctx = build_commitment_acta_context(decision=decision, generated_by=job.created_by)
        return render_to_string("academic/reports/commission_commitment_acta.html", ctx)

    if job.report_type == ReportJob.ReportType.ACADEMIC_COMMISSION_GROUP_ACTA:
        from academic.models import Commission  # noqa: PLC0415

        commission_id = (job.params or {}).get("commission_id")
        commission = (
            Commission.objects.select_related("institution", "academic_year", "period", "group", "group__grade", "group__director")
            .get(id=commission_id)
        )
        ai_blocks = _resolve_group_acta_ai_blocks_for_job(commission=commission)
        ctx = build_commission_group_acta_context(
            commission=commission,
            generated_by=job.created_by,
            ai_blocks=ai_blocks,
        )
        return render_to_string("academic/reports/commission_group_acta.html", ctx)

    if job.report_type == ReportJob.ReportType.ATTENDANCE_MANUAL_SHEET:
        from academic.models import Group  # noqa: PLC0415

        group_id = (job.params or {}).get("group_id")
        cols = int((job.params or {}).get("columns") or 24)
        cols = max(1, min(cols, 40))
        group = Group.objects.select_related("grade", "academic_year", "director").get(id=group_id)
        ctx = build_attendance_manual_sheet_context(group=group, user=job.created_by, columns=cols)
        return render_to_string("attendance/reports/attendance_manual_sheet_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.ENROLLMENT_LIST:
        params = job.params or {}
        year_id = params.get("year_id")
        grade_id = params.get("grade_id")
        group_id = params.get("group_id")
        ctx = build_enrollment_list_report_context(
            year_id=int(year_id) if year_id not in (None, "") else None,
            grade_id=int(grade_id) if grade_id not in (None, "") else None,
            group_id=int(group_id) if group_id not in (None, "") else None,
        )
        return render_to_string("students/reports/enrollment_list_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.FAMILY_DIRECTORY_BY_GROUP:
        ctx = build_family_directory_by_group_report_context()
        return render_to_string("students/reports/family_directory_by_group_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.GRADE_REPORT_SHEET:
        from academic.models import Group  # noqa: PLC0415

        params = job.params or {}
        group_id = params.get("group_id")
        period_id = params.get("period_id")
        columns = int(params.get("columns") or 3)
        subject_name = str(params.get("subject_name") or "")
        teacher_name = str(params.get("teacher_name") or "")

        group = Group.objects.select_related("grade", "academic_year", "director").get(id=group_id)
        ctx = build_grade_report_sheet_context(
            group=group,
            user=job.created_by,
            columns=columns,
            period_id=int(period_id) if period_id not in (None, "") else None,
            subject_name=subject_name,
            teacher_name=teacher_name,
        )
        return render_to_string("academic/reports/grade_report_sheet_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.TEACHER_STATISTICS_AI:
        from core.models import Institution  # noqa: PLC0415

        params = job.params or {}
        institution = Institution.objects.first() or Institution(name="")

        return render_to_string(
            "teachers/reports/teacher_statistics_ai_pdf.html",
            {
                "institution": institution,
                "year_name": str(params.get("year_name") or ""),
                "period_name": str(params.get("period_name") or ""),
                "grade_name": str(params.get("grade_name") or ""),
                "group_name": str(params.get("group_name") or ""),
                "report_date": str(params.get("report_date") or ""),
                "teacher_name": str(params.get("teacher_name") or ""),
                "analysis_html": str(params.get("analysis_html") or ""),
            },
        )

    if job.report_type == ReportJob.ReportType.CLASS_PLAN:
        from academic.models import ClassPlan  # noqa: PLC0415
        from core.models import Institution  # noqa: PLC0415

        params = job.params or {}
        plan_id = params.get("class_plan_id")
        if not plan_id:
            raise ValueError("class_plan_id is required")

        plan = ClassPlan.objects.select_related(
            "period",
            "topic",
            "teacher_assignment",
            "teacher_assignment__teacher",
            "teacher_assignment__group",
            "teacher_assignment__group__grade",
            "teacher_assignment__academic_load",
            "teacher_assignment__academic_load__subject",
            "teacher_assignment__academic_load__subject__area",
        ).get(id=plan_id)

        institution = Institution.objects.first() or Institution(name="")
        return render_to_string(
            "academic/reports/class_plan_pdf.html",
            _build_class_plan_pdf_context(institution=institution, plan=plan),
        )

    if job.report_type == ReportJob.ReportType.STUDY_CERTIFICATION:
        from core.models import Institution  # noqa: PLC0415

        params = job.params or {}
        enrollment_id = params.get("enrollment_id")
        enrollment = Enrollment.objects.select_related(
            "student",
            "student__user",
            "grade",
            "group",
            "academic_year",
            "campus",
        ).get(id=enrollment_id)

        institution = Institution.objects.first() or Institution(name="")
        student = enrollment.student
        student_user = student.user
        campus = enrollment.campus

        signer_name = ""
        try:
            if getattr(institution, "rector_id", None):
                signer_name = institution.rector.get_full_name()  # type: ignore[union-attr]
        except Exception:
            signer_name = ""

        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.services import build_public_verify_url, get_or_create_for_report_job  # noqa: PLC0415

        ctx = {
            "institution": institution,
            "student_full_name": student_user.get_full_name(),
            "document_type": student.document_type or "Documento",
            "document_number": student.document_number or "",
            "grade_name": getattr(enrollment.grade, "name", "") or str(enrollment.grade),
            "group_name": getattr(enrollment.group, "name", "") if enrollment.group else "",
            "academic_year": getattr(enrollment.academic_year, "year", "") or str(enrollment.academic_year),
            "issue_date": date.today(),
            "place": (getattr(campus, "municipality", "") or "").strip() if campus else "",
            "signer_name": signer_name,
            "signer_role": "Rector(a)",
        }

        vdoc = get_or_create_for_report_job(
            job_id=job.id,
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATION,
            public_payload={
                "title": f"Certificación académica: {ctx.get('student_full_name','').strip()} - {ctx.get('academic_year','')}",
                "student_full_name": ctx.get("student_full_name", ""),
                "document_number": ctx.get("document_number", ""),
                "grade_name": ctx.get("grade_name", ""),
                "group_name": ctx.get("group_name", ""),
                "academic_year": ctx.get("academic_year", ""),
            },
        )
        verify_url = _coerce_public_absolute_url(job, build_public_verify_url(vdoc.token))
        verify_url_prefix = ""
        try:
            marker = f"{vdoc.token}/"
            if verify_url and marker in verify_url:
                verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
        except Exception:
            verify_url_prefix = ""
        ctx["verify_url"] = verify_url
        ctx["verify_token"] = vdoc.token
        ctx["verify_url_prefix"] = verify_url_prefix
        ctx["qr_image_src"] = _qr_png_data_uri(verify_url) if verify_url else ""
        return render_to_string("students/reports/study_certification_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.OBSERVER_REPORT:
        from core.models import Institution  # noqa: PLC0415
        from students.models import Student, FamilyMember, ObserverAnnotation  # noqa: PLC0415

        params = job.params or {}
        student_id = params.get("student_id")
        student = Student.objects.select_related("user").get(pk=student_id)

        # Prefer active enrollment to resolve campus/institution.
        current_enrollment = (
            Enrollment.objects.select_related(
                "academic_year",
                "grade",
                "group",
                "campus",
                "campus__institution",
            )
            .filter(student=student, status="ACTIVE")
            .order_by("-academic_year__year", "-id")
            .first()
        )
        campus = getattr(current_enrollment, "campus", None) if current_enrollment else None
        institution = getattr(campus, "institution", None) if campus else None
        if institution is None:
            institution = Institution.objects.first() or Institution()

        user = job.created_by
        role = getattr(user, "role", None)

        # Families/enrollments.
        family_members = list(
            FamilyMember.objects.filter(student=student).select_related("user").order_by("-is_main_guardian", "id")
        )
        enrollments = list(
            Enrollment.objects.select_related("academic_year", "grade", "group", "campus")
            .filter(student=student)
            .order_by("-academic_year__year", "-id")
        )

        # Disciplina: match the visibility rules from students.views.StudentViewSet.observer_report.
        from discipline.models import DisciplineCase  # noqa: PLC0415
        from academic.models import AcademicYear, Group, TeacherAssignment  # noqa: PLC0415

        cases_qs = (
            DisciplineCase.objects.select_related(
                "enrollment",
                "enrollment__academic_year",
                "enrollment__grade",
                "enrollment__group",
                "created_by",
            )
            .prefetch_related("events")
            .filter(student=student)
            .order_by("-occurred_at", "-id")
        )

        if role == "TEACHER":
            active_year = AcademicYear.objects.filter(status="ACTIVE").first()
            directed_groups = Group.objects.filter(director=user)
            if active_year:
                directed_groups = directed_groups.filter(academic_year=active_year)

            if active_year:
                assigned_group_ids = set(
                    TeacherAssignment.objects.filter(teacher=user, academic_year=active_year).values_list(
                        "group_id", flat=True
                    )
                )
            else:
                assigned_group_ids = set(TeacherAssignment.objects.filter(teacher=user).values_list("group_id", flat=True))

            allowed_group_ids = set(directed_groups.values_list("id", flat=True)) | assigned_group_ids
            if not allowed_group_ids:
                cases_qs = cases_qs.none()
            else:
                cases_qs = cases_qs.filter(enrollment__group_id__in=allowed_group_ids).distinct()
        elif role in {"ADMIN", "SUPERADMIN", "COORDINATOR", "SECRETARY"}:
            cases_qs = cases_qs
        elif role == "PARENT":
            is_guardian = FamilyMember.objects.filter(student=student, user=user).exists()
            if not is_guardian:
                cases_qs = cases_qs.none()
        elif role == "STUDENT":
            if getattr(student, "user_id", None) != getattr(user, "id", None):
                cases_qs = cases_qs.none()
        else:
            cases_qs = cases_qs.none()

        def _full_name(u) -> str:
            try:
                return u.get_full_name() or getattr(u, "username", "") or ""
            except Exception:
                return ""

        def _dt(value):
            return value or None

        def _discipline_severity_meta(manual_severity: str | None):
            sev = (manual_severity or "MINOR").strip().upper()
            if sev == "VERY_MAJOR":
                return {
                    "label": "Llamado de Atención (Gravísima)",
                    "badge_bg": "#fee2e2",
                    "badge_text": "#b91c1c",
                    "border": "#ef4444",
                }
            if sev == "MAJOR":
                return {
                    "label": "Llamado de Atención (Grave)",
                    "badge_bg": "#fee2e2",
                    "badge_text": "#b91c1c",
                    "border": "#ef4444",
                }
            return {
                "label": "Llamado de Atención (Leve)",
                "badge_bg": "#fef3c7",
                "badge_text": "#92400e",
                "border": "#eab308",
            }

        def _annotation_meta(annotation_type: str | None):
            t = (annotation_type or "OBSERVATION").strip().upper()
            if t == "ALERT":
                return {
                    "label": "Anotación (Alerta)",
                    "badge_bg": "#fee2e2",
                    "badge_text": "#b91c1c",
                    "border": "#ef4444",
                }
            if t == "PRAISE":
                return {
                    "label": "Anotación (Felicitación)",
                    "badge_bg": "#dcfce7",
                    "badge_text": "#166534",
                    "border": "#22c55e",
                }
            if t == "COMMITMENT":
                return {
                    "label": "Anotación (Compromiso)",
                    "badge_bg": "#e0f2fe",
                    "badge_text": "#075985",
                    "border": "#0ea5e9",
                }
            return {
                "label": "Anotación",
                "badge_bg": "#fef3c7",
                "badge_text": "#92400e",
                "border": "#eab308",
            }

        discipline_entries = []
        for case in list(cases_qs):
            enrollment = getattr(case, "enrollment", None)
            academic_year = None
            grade_name = ""
            group_name = ""
            try:
                academic_year = getattr(getattr(enrollment, "academic_year", None), "year", None)
                grade_name = getattr(getattr(enrollment, "grade", None), "name", "") or ""
                group_name = getattr(getattr(enrollment, "group", None), "name", "") or ""
            except Exception:
                pass

            events_out = []
            try:
                for ev in list(case.events.all()):
                    event_type_label = ""
                    try:
                        event_type_label = ev.get_event_type_display()  # type: ignore[attr-defined]
                    except Exception:
                        event_type_label = ev.event_type

                    events_out.append(
                        {
                            "id": ev.id,
                            "event_type": ev.event_type,
                            "event_type_label": event_type_label,
                            "text": ev.text,
                            "created_at": _dt(ev.created_at),
                            "created_by_name": _full_name(getattr(ev, "created_by", None)),
                        }
                    )
            except Exception:
                events_out = []

            discipline_entries.append(
                {
                    "id": case.id,
                    "occurred_at": _dt(case.occurred_at),
                    "location": case.location,
                    "manual_severity": case.manual_severity,
                    "severity": _discipline_severity_meta(getattr(case, "manual_severity", None)),
                    "law_1620_type": case.law_1620_type,
                    "status": case.status,
                    "academic_year": academic_year,
                    "grade_name": grade_name,
                    "group_name": group_name,
                    "narrative": case.narrative,
                    "decision_text": case.decision_text,
                    "created_by_name": _full_name(getattr(case, "created_by", None)),
                    "created_at": _dt(case.created_at),
                    "events": events_out,
                }
            )

        observer_number = f"{getattr(student, 'pk', 0):010d}"
        observer_number_display = str(getattr(student, "pk", "") or "")
        student_user = student.user
        student_full_name = (student_user.get_full_name() or "").strip()

        # Observer annotations.
        annotations_qs = (
            ObserverAnnotation.objects.select_related("period", "period__academic_year", "created_by", "updated_by")
            .filter(student=student, is_deleted=False)
            .order_by("-created_at", "-id")
        )
        if role == "PARENT" and not FamilyMember.objects.filter(student=student, user=user).exists():
            annotations_qs = annotations_qs.none()
        if role == "STUDENT" and getattr(student, "user_id", None) != getattr(user, "id", None):
            annotations_qs = annotations_qs.none()

        observer_annotations = []
        for a in list(annotations_qs):
            period = getattr(a, "period", None)
            annotation_type_label = ""
            try:
                annotation_type_label = a.get_annotation_type_display()  # type: ignore[attr-defined]
            except Exception:
                annotation_type_label = str(a.annotation_type or "")

            observer_annotations.append(
                {
                    "id": a.id,
                    "period": {
                        "id": a.period_id,
                        "name": getattr(period, "name", "") if period else "",
                        "academic_year": getattr(getattr(period, "academic_year", None), "year", None) if period else None,
                        "is_closed": bool(getattr(period, "is_closed", False)) if period else False,
                    }
                    if a.period_id
                    else None,
                    "annotation_type": a.annotation_type,
                    "annotation_type_label": annotation_type_label,
                    "meta": _annotation_meta(getattr(a, "annotation_type", None)),
                    "title": a.title,
                    "text": a.text,
                    "commitments": a.commitments,
                    "commitment_due_date": _dt(a.commitment_due_date),
                    "commitment_responsible": a.commitment_responsible,
                    "is_automatic": bool(a.is_automatic),
                    "created_at": _dt(a.created_at),
                    "updated_at": _dt(a.updated_at),
                    "created_by_name": _full_name(getattr(a, "created_by", None)),
                    "updated_by_name": _full_name(getattr(a, "updated_by", None)),
                }
            )

        # Build the same merged timeline used by the web preview.
        timeline = []
        for entry in discipline_entries:
            ts = entry.get("occurred_at") or entry.get("created_at")
            timeline.append({"kind": "discipline", "ts": ts, "entry": entry})
        for ann in observer_annotations:
            ts = ann.get("created_at")
            timeline.append({"kind": "observer_annotation", "ts": ts, "annotation": ann})
        timeline.sort(key=lambda r: (r.get("ts") is not None, r.get("ts")), reverse=True)

        academic_year_label = ""
        try:
            if current_enrollment and getattr(getattr(current_enrollment, "academic_year", None), "year", None):
                academic_year_label = str(current_enrollment.academic_year.year)
        except Exception:
            academic_year_label = ""

        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.services import build_public_verify_url, get_or_create_for_report_job  # noqa: PLC0415

        vdoc = get_or_create_for_report_job(
            job_id=job.id,
            doc_type=VerifiableDocument.DocType.OBSERVER_REPORT,
            public_payload={
                "title": f"Observador del estudiante: {student_full_name}",
                "student_full_name": student_full_name,
                "document_number": getattr(student, "document_number", "") or "",
                "observer_number": observer_number,
                "academic_year": academic_year_label,
            },
        )
        verify_url = _coerce_public_absolute_url(job, build_public_verify_url(vdoc.token))
        verify_url_prefix = ""
        try:
            marker = f"{vdoc.token}/"
            if verify_url and marker in verify_url:
                verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
        except Exception:
            verify_url_prefix = ""

        logo_url = None
        try:
            if getattr(institution, "logo", None) and getattr(institution.logo, "url", None):
                logo_url = institution.logo.url
        except Exception:
            logo_url = None

        student_photo_url = None
        try:
            if getattr(student, "photo", None) and getattr(student.photo, "url", None):
                student_photo_url = student.photo.url
        except Exception:
            student_photo_url = None

        header_line3 = getattr(institution, "pdf_header_line3", "") or ""
        header_line3_display = header_line3
        try:
            if header_line3.strip() == "DANE: 223675000297 NIT: 900003571-2":
                header_line3_display = "ee_22367500029701@sedcordoba.gov.co"
        except Exception:
            header_line3_display = header_line3

        ctx = {
            "generated_at": datetime.now(),
            "observer_number": observer_number,
            "observer_number_display": observer_number_display,
            "institution": {
                "name": getattr(institution, "name", "") or "",
                "dane_code": getattr(institution, "dane_code", "") or "",
                "nit": getattr(institution, "nit", "") or "",
                "pdf_header_line1": getattr(institution, "pdf_header_line1", "") or "",
                "pdf_header_line2": getattr(institution, "pdf_header_line2", "") or "",
                "pdf_header_line3": header_line3,
                "pdf_header_line3_display": header_line3_display,
                "logo_url": logo_url,
            },
            "campus": {
                "name": getattr(campus, "name", "") if campus else "",
                "municipality": getattr(campus, "municipality", "") if campus else "",
            },
            "student": {
                "id": student.pk,
                "full_name": student_full_name,
                "first_name": getattr(student_user, "first_name", "") or "",
                "last_name": getattr(student_user, "last_name", "") or "",
                "document_type": getattr(student, "document_type", "") or "",
                "document_number": getattr(student, "document_number", "") or "",
                "birth_date": _dt(getattr(student, "birth_date", None)),
                "place_of_issue": getattr(student, "place_of_issue", "") or "",
                "neighborhood": getattr(student, "neighborhood", "") or "",
                "address": getattr(student, "address", "") or "",
                "blood_type": getattr(student, "blood_type", "") or "",
                "stratum": getattr(student, "stratum", "") or "",
                "sisben_score": getattr(student, "sisben_score", "") or "",
                "photo_url": student_photo_url,
            },
            "family_members": [
                {
                    "id": fm.id,
                    "relationship": fm.relationship,
                    "full_name": fm.full_name,
                    "document_number": fm.document_number,
                    "phone": fm.phone,
                    "email": fm.email,
                    "is_main_guardian": fm.is_main_guardian,
                }
                for fm in family_members
            ],
            "enrollments": [
                {
                    "id": e.id,
                    "academic_year": getattr(getattr(e, "academic_year", None), "year", None),
                    "grade_name": getattr(getattr(e, "grade", None), "name", "") or "",
                    "group_name": getattr(getattr(e, "group", None), "name", "") or "",
                    "campus_name": getattr(getattr(e, "campus", None), "name", "") or "",
                    "status": e.status,
                    "status_label": (e.get_status_display() if hasattr(e, "get_status_display") else e.status),
                    "final_status": e.final_status,
                    "enrolled_at": _dt(getattr(e, "enrolled_at", None)),
                }
                for e in enrollments
            ],
            "discipline_entries": discipline_entries,
            "observer_annotations": observer_annotations,
            "timeline": timeline,
            "verify_url": verify_url,
            "verify_token": vdoc.token,
            "verify_url_prefix": verify_url_prefix,
            "qr_image_src": _qr_png_data_uri(verify_url) if verify_url else "",
        }
        return render_to_string("students/reports/observer_report_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
        from core.models import Institution  # noqa: PLC0415
        from students.models import CertificateIssue  # noqa: PLC0415

        params = job.params or {}
        certificate_uuid = str(params.get("certificate_uuid") or "").strip()
        verify_url = str(params.get("verify_url") or "").strip()
        verify_token = str(params.get("verify_token") or "").strip()
        verify_url = re.sub(r"/\s+", "/", verify_url)
        verify_url_prefix = ""
        try:
            marker = f"{verify_token}/"
            if verify_token and verify_url and marker in verify_url:
                verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
        except Exception:
            verify_url_prefix = ""

        issue = CertificateIssue.objects.select_related("enrollment", "enrollment__grade", "enrollment__campus").get(
            uuid=certificate_uuid
        )
        payload = issue.payload or {}
        institution = Institution.objects.first() or Institution()

        issue_date_raw = payload.get("issue_date")
        issue_date: date
        if isinstance(issue_date_raw, date):
            issue_date = issue_date_raw
            # datetime is also a date, but keep it as date.
            if isinstance(issue_date_raw, datetime):
                issue_date = issue_date_raw.date()
        else:
            try:
                issue_date = datetime.strptime(str(issue_date_raw or ""), "%Y-%m-%d").date()
            except Exception:
                issue_date = date.today()

        ctx = {
            "institution": institution,
            "student_full_name": payload.get("student_full_name") or "",
            "document_type": payload.get("document_type") or "Documento",
            "document_number": payload.get("document_number") or "",
            "academic_year": payload.get("academic_year") or "",
            "grade_name": payload.get("grade_name") or "",
            "academic_level": payload.get("academic_level") or "",
            "rows": payload.get("rows") or [],
            "conduct": payload.get("conduct") or "BUENA",
            "final_status": payload.get("final_status") or "APROBADO",
            "issue_date": issue_date,
            "signer_name": payload.get("signer_name") or "",
            "signer_role": payload.get("signer_role") or "",
            "verify_url": verify_url,
            "verify_token": verify_token,
            "verify_url_prefix": verify_url_prefix,
            "qr_image_src": _qr_png_data_uri(verify_url) if verify_url else "",
            "seal_hash": issue.seal_hash,
        }
        return render_to_string("students/reports/certificate_studies_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.ELECTION_CENSUS_QR:
        return _render_election_census_qr_html(job)

    raise ValueError(f"Unsupported report_type: {job.report_type}")


def _coerce_public_absolute_url(job: ReportJob, value: str) -> str:
    """Ensure a URL/path is absolute using the job's persisted public base.

    QR scanners often require a full URL (scheme + host). Celery tasks do not
    have request context, so the API persists a `public_site_url` in params.
    """

    raw = (value or "").strip()
    if not raw:
        return ""

    try:
        parsed = urlparse(raw)
        if parsed.scheme and parsed.netloc:
            return raw
    except Exception:
        # If parsing fails, keep raw and try joining below.
        pass

    params = job.params or {}
    base = str(params.get("public_site_url") or "").strip()
    if not base:
        base = (getattr(settings, "PUBLIC_SITE_URL", "") or "").strip()
    if not base:
        return raw

    try:
        return urljoin(base.rstrip("/") + "/", raw.lstrip("/"))
    except Exception:
        return raw



def _qr_png_data_uri(text: str) -> str:
    # Avoid temp files; embed QR as a data URI.
    try:
        import qrcode  # noqa: PLC0415
        from io import BytesIO  # noqa: PLC0415

        img = qrcode.make(text)
        buf = BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception:
        return ""


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def generate_report_job_pdf(self, job_id: int) -> None:
    started_monotonic = time.monotonic()
    job = ReportJob.objects.select_related("created_by").get(id=job_id)

    # Best-effort backfill for older jobs: preview endpoint can add `public_site_url`
    # at request-time, but the Celery worker needs it persisted to build absolute QR URLs.
    try:
        params = job.params or {}
        if not str(params.get("public_site_url") or "").strip():
            public_base = (getattr(settings, "PUBLIC_SITE_URL", "") or "").strip().rstrip("/")
            if public_base:
                job.params = {**params, "public_site_url": public_base}
                job.save(update_fields=["params"])
    except Exception:
        pass

    if job.status in {ReportJob.Status.SUCCEEDED, ReportJob.Status.CANCELED}:
        logger.info("report_job.skip", extra={"job_id": job.id, "status": job.status, "report_type": job.report_type})
        return

    job.mark_running()

    def _abort_if_canceled() -> bool:
        job.refresh_from_db(fields=["status"])
        return job.status == ReportJob.Status.CANCELED

    try:
        job.set_progress(10)
        if _abort_if_canceled():
            return
        html = _render_report_html(job)

        job.set_progress(40)
        if _abort_if_canceled():
            return

        from reports.weasyprint_utils import render_pdf_bytes_from_html  # noqa: PLC0415

        out_dir_rel = f"{settings.PRIVATE_REPORTS_DIR}".strip("/")

        if job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_ENROLLMENT:
            params = job.params or {}
            out_filename = (
                f"informe-academico-enrollment-{params.get('enrollment_id')}-period-{params.get('period_id')}.pdf"
            )
        elif job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_GROUP:
            params = job.params or {}
            out_filename = f"informe-academico-grupo-{params.get('group_id')}-period-{params.get('period_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_SABANA:
            params = job.params or {}
            out_filename = f"sabana-notas-grupo-{params.get('group_id')}-period-{params.get('period_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.DISCIPLINE_CASE_ACTA:
            params = job.params or {}
            out_filename = f"caso-{params.get('case_id')}-acta.pdf"
        elif job.report_type == ReportJob.ReportType.ACADEMIC_COMMISSION_ACTA:
            params = job.params or {}
            out_filename = f"comision-acta-decision-{params.get('decision_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.ACADEMIC_COMMISSION_GROUP_ACTA:
            params = job.params or {}
            out_filename = f"comision-grupal-{params.get('commission_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.ATTENDANCE_MANUAL_SHEET:
            params = job.params or {}
            out_filename = f"planilla_asistencia_grupo-{params.get('group_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.ENROLLMENT_LIST:
            params = job.params or {}
            y = params.get("year_id") or "actual"
            g = params.get("grade_id") or "all"
            gr = params.get("group_id") or "all"
            out_filename = f"reporte_matriculados_y{y}_g{g}_gr{gr}.pdf"
        elif job.report_type == ReportJob.ReportType.FAMILY_DIRECTORY_BY_GROUP:
            out_filename = "directorio_padres_por_grado_grupo.pdf"
        elif job.report_type == ReportJob.ReportType.GRADE_REPORT_SHEET:
            params = job.params or {}
            gid = params.get("group_id")
            pid = params.get("period_id") or ""
            out_filename = f"planilla_notas_grupo-{gid}_periodo-{pid}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.TEACHER_STATISTICS_AI:
            params = job.params or {}
            y = str(params.get("year_name") or "").strip() or "anio"
            p = str(params.get("period_name") or "").strip() or "periodo"
            out_filename = f"analisis_ia_{y}_{p}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.CLASS_PLAN:
            params = job.params or {}
            plan_id = params.get("class_plan_id")
            from academic.models import ClassPlan  # noqa: PLC0415

            plan = ClassPlan.objects.select_related("topic").filter(id=plan_id).first()
            out_filename = _build_class_plan_pdf_filename(plan) if plan is not None else f"Plan_de_Clase_Tema_{plan_id}.pdf"
        elif job.report_type == ReportJob.ReportType.STUDY_CERTIFICATION:
            params = job.params or {}
            enrollment_id = params.get("enrollment_id")
            out_filename = f"certificacion_academica_enrollment-{enrollment_id}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.OBSERVER_REPORT:
            params = job.params or {}
            student_id = params.get("student_id")
            out_filename = f"observador_estudiante-{student_id}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            params = job.params or {}
            cu = str(params.get("certificate_uuid") or "")
            out_filename = f"certificado_estudios_{cu}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.ELECTION_CENSUS_QR:
            params = job.params or {}
            process_id = params.get("process_id") or "0"
            group_suffix = (str(params.get("group_filter") or "todos")).replace(" ", "_")
            out_filename = f"carnes_electorales_proceso-{process_id}_grupo-{group_suffix}.pdf"
        else:
            out_filename = f"report_{job.id}.pdf"

        relpath = str(Path(out_dir_rel) / out_filename)

        base_root = Path(settings.PRIVATE_STORAGE_ROOT)
        out_path = _safe_join_private(base_root, relpath)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        job.set_progress(70)
        if _abort_if_canceled():
            return

        pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
        out_path.write_bytes(pdf_bytes)

        job.set_progress(95)
        if _abort_if_canceled():
            return

        size = out_path.stat().st_size if out_path.exists() else None
        job.mark_succeeded(output_relpath=relpath, output_filename=out_filename, output_size_bytes=size)

        # Side effects for certain reports.
        if job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            try:
                from students.models import CertificateIssue  # noqa: PLC0415

                params = job.params or {}
                cu = str(params.get("certificate_uuid") or "").strip()
                issue = CertificateIssue.objects.filter(uuid=cu).first()
                if issue:
                    issue.pdf_private_relpath = relpath
                    issue.pdf_private_filename = out_filename
                    issue.status = CertificateIssue.STATUS_ISSUED
                    issue.save(update_fields=["pdf_private_relpath", "pdf_private_filename", "status"])
            except Exception:
                # Never break job success due to certificate bookkeeping.
                pass

        duration_s = round(time.monotonic() - started_monotonic, 3)
        logger.info(
            "report_job.succeeded",
            extra={
                "job_id": job.id,
                "report_type": job.report_type,
                "duration_s": duration_s,
                "output_size_bytes": size,
            },
        )

    except Exception as exc:  # noqa: BLE001
        if job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            try:
                from students.models import CertificateIssue  # noqa: PLC0415

                # If the issue no longer exists, retries won't recover.
                if isinstance(exc, CertificateIssue.DoesNotExist):
                    job.mark_failed(
                        error_code="CERTIFICATE_ISSUE_NOT_FOUND",
                        error_message="CertificateIssue no existe o fue eliminado antes de completar el job.",
                    )
                    logger.exception(
                        "report_job.failed_non_retriable",
                        extra={
                            "job_id": job.id,
                            "report_type": job.report_type,
                        },
                    )
                    return

                # Revoke pending certificate only on the last retry attempt.
                current_retries = int(getattr(self.request, "retries", 0) or 0)
                max_retries = int(getattr(self, "max_retries", 0) or 0)
                is_last_attempt = current_retries >= max_retries
                if is_last_attempt:
                    params = job.params or {}
                    cu = str(params.get("certificate_uuid") or "").strip()
                    CertificateIssue.objects.filter(uuid=cu, status=CertificateIssue.STATUS_PENDING).delete()
            except Exception:
                pass

        job.mark_failed(error_code="PDF_GENERATION_FAILED", error_message=str(exc))
        duration_s = round(time.monotonic() - started_monotonic, 3)
        logger.exception(
            "report_job.failed",
            extra={
                "job_id": job.id,
                "report_type": job.report_type,
                "duration_s": duration_s,
            },
        )
        raise
