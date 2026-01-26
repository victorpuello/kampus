from __future__ import annotations

import base64
import logging
import time
import re
from urllib.parse import urljoin, urlparse
from datetime import date, datetime
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.template.loader import render_to_string

from academic.models import Period
from academic.reports import build_grade_report_sheet_context
from students.academic_period_report import (
    build_academic_period_group_report_context,
    build_academic_period_report_context,
)
from students.models import Enrollment

from attendance.reports import build_attendance_manual_sheet_context
from discipline.reports import build_case_acta_context
from students.reports import build_enrollment_list_report_context

from .models import ReportJob
from .weasyprint_utils import PDF_BASE_CSS, weasyprint_url_fetcher


logger = logging.getLogger(__name__)


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
            "group",
            "group__director",
            "academic_year",
        ).get(id=enrollment_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.services import build_public_verify_url, get_or_create_for_report_job  # noqa: PLC0415

        ctx = build_academic_period_report_context(enrollment=enrollment, period=period)

        rows_public = []
        for r in (ctx.get("rows") or [])[:80]:
            if not isinstance(r, dict):
                continue
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
        return render_to_string("students/reports/academic_period_report_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.ACADEMIC_PERIOD_GROUP:
        from academic.models import Group  # noqa: PLC0415

        group_id = (job.params or {}).get("group_id")
        period_id = (job.params or {}).get("period_id")

        group = Group.objects.select_related("academic_year", "director").get(id=group_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        enrollments = (
            Enrollment.objects.select_related(
                "student",
                "student__user",
                "grade",
                "group",
                "group__director",
                "academic_year",
            )
            .filter(group_id=group.id, academic_year_id=period.academic_year_id, status="ACTIVE")
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )
        from verification.models import VerifiableDocument  # noqa: PLC0415
        from verification.services import build_public_verify_url, get_or_create_for_report_job  # noqa: PLC0415

        ctx = build_academic_period_group_report_context(enrollments=enrollments, period=period)

        vdoc = get_or_create_for_report_job(
            job_id=job.id,
            doc_type=VerifiableDocument.DocType.REPORT_CARD,
            public_payload={
                "title": f"Informe académico grupo: {getattr(group, 'name', '')} - {getattr(period, 'name', '')} - {getattr(period.academic_year, 'year', '')}",
                "group_name": getattr(group, "name", ""),
                "period_name": getattr(period, "name", ""),
                "year_name": getattr(period.academic_year, "year", ""),
            },
        )
        verify_url = _coerce_public_absolute_url(job, build_public_verify_url(vdoc.token))
        ctx["verify_url"] = verify_url
        ctx["qr_image_src"] = _qr_png_data_uri(verify_url) if verify_url else ""
        return render_to_string("students/reports/academic_period_report_group_pdf.html", ctx)

    if job.report_type == ReportJob.ReportType.DISCIPLINE_CASE_ACTA:
        from discipline.models import DisciplineCase  # noqa: PLC0415

        case_id = (job.params or {}).get("case_id")
        case = DisciplineCase.objects.get(id=case_id)
        ctx = build_case_acta_context(case=case, generated_by=job.created_by)
        return render_to_string("discipline/case_acta.html", ctx)

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
        elif job.report_type == ReportJob.ReportType.DISCIPLINE_CASE_ACTA:
            params = job.params or {}
            out_filename = f"caso-{params.get('case_id')}-acta.pdf"
        elif job.report_type == ReportJob.ReportType.ATTENDANCE_MANUAL_SHEET:
            params = job.params or {}
            out_filename = f"planilla_asistencia_grupo-{params.get('group_id')}.pdf"
        elif job.report_type == ReportJob.ReportType.ENROLLMENT_LIST:
            params = job.params or {}
            y = params.get("year_id") or "actual"
            g = params.get("grade_id") or "all"
            gr = params.get("group_id") or "all"
            out_filename = f"reporte_matriculados_y{y}_g{g}_gr{gr}.pdf"
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
        elif job.report_type == ReportJob.ReportType.STUDY_CERTIFICATION:
            params = job.params or {}
            enrollment_id = params.get("enrollment_id")
            out_filename = f"certificacion_academica_enrollment-{enrollment_id}.pdf".replace(" ", "_")
        elif job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            params = job.params or {}
            cu = str(params.get("certificate_uuid") or "")
            out_filename = f"certificado_estudios_{cu}.pdf".replace(" ", "_")
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
        # Certificates should not remain valid if PDF generation fails.
        if job.report_type == ReportJob.ReportType.CERTIFICATE_STUDIES:
            try:
                from students.models import CertificateIssue  # noqa: PLC0415

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
