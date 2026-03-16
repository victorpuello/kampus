from __future__ import annotations

from datetime import date, datetime
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.management.base import BaseCommand
from django.template.loader import render_to_string

from core.models import Institution
from reports.models import ReportJob
from reports.tasks import _qr_png_data_uri
from reports.weasyprint_utils import render_pdf_bytes_from_html
from students.models import CertificateIssue
from verification.services import build_public_verify_url, get_or_create_for_certificate_issue


def _safe_join_private(root: Path, relpath: str) -> Path:
    rel = Path(relpath)
    if rel.is_absolute():
        raise ValueError("Absolute paths are not allowed")

    final = (root / rel).resolve()
    root_resolved = root.resolve()
    if root_resolved not in final.parents and final != root_resolved:
        raise ValueError("Invalid path")
    return final


def _issue_private_pdf_exists(issue: CertificateIssue) -> bool:
    relpath = str(getattr(issue, "pdf_private_relpath", "") or "").strip()
    if not relpath:
        return False
    try:
        abs_path = _safe_join_private(Path(settings.PRIVATE_STORAGE_ROOT), relpath)
    except ValueError:
        return False
    return abs_path.exists()


def _issue_legacy_pdf_exists(issue: CertificateIssue) -> bool:
    if not getattr(issue, "pdf_file", None):
        return False
    try:
        name = str(issue.pdf_file.name or "").strip()
        if not name:
            return False
        return bool(issue.pdf_file.storage.exists(name))
    except Exception:
        return False


def _find_recoverable_report_job(issue: CertificateIssue) -> ReportJob | None:
    job = (
        ReportJob.objects.filter(
            report_type=ReportJob.ReportType.CERTIFICATE_STUDIES,
            status=ReportJob.Status.SUCCEEDED,
            params__certificate_uuid=str(issue.uuid),
        )
        .exclude(output_relpath__isnull=True)
        .exclude(output_relpath="")
        .order_by("-finished_at", "-id")
        .first()
    )
    if not job or not job.output_relpath:
        return None

    try:
        abs_path = _safe_join_private(Path(settings.PRIVATE_STORAGE_ROOT), job.output_relpath)
    except ValueError:
        return None

    return job if abs_path.exists() else None


def _parse_issue_date(value) -> date:
    if isinstance(value, date):
        return value.date() if isinstance(value, datetime) else value
    try:
        return datetime.strptime(str(value or ""), "%Y-%m-%d").date()
    except Exception:
        return date.today()


def _build_verify_context(issue: CertificateIssue) -> tuple[str, str, str]:
    payload = issue.payload or {}
    public_payload = {
        "title": payload.get("title") or "Certificado de estudios",
        "student_full_name": payload.get("student_full_name") or "",
        "document_number": payload.get("document_number") or "",
        "academic_year": payload.get("academic_year") or "",
        "grade_name": payload.get("grade_name") or payload.get("grade") or "",
        "rows": payload.get("rows") or [],
        "final_status": payload.get("final_status") or "",
    }

    vdoc = get_or_create_for_certificate_issue(
        issue_uuid=str(issue.uuid),
        public_payload=public_payload,
        seal_hash=getattr(issue, "seal_hash", "") or "",
    )
    verify_url = build_public_verify_url(vdoc.token)
    verify_url_prefix = ""
    marker = f"{vdoc.token}/"
    if vdoc.token and verify_url and marker in verify_url:
        verify_url_prefix = verify_url.split(marker)[0].rstrip("/") + "/"
    return verify_url, vdoc.token, verify_url_prefix


def _render_certificate_pdf_bytes(issue: CertificateIssue) -> bytes:
    payload = issue.payload or {}
    institution = Institution.objects.first() or Institution()
    verify_url, verify_token, verify_url_prefix = _build_verify_context(issue)

    signer_name = str(payload.get("signer_name") or "").strip()
    signer_role = str(payload.get("signer_role") or "").strip()
    if not signer_name:
        if getattr(institution, "rector", None):
            signer_name = institution.rector.get_full_name()
            signer_role = signer_role or "Rector(a)"
        elif getattr(institution, "secretary", None):
            signer_name = institution.secretary.get_full_name()
            signer_role = signer_role or "Secretaría"

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
        "issue_date": _parse_issue_date(payload.get("issue_date")),
        "signer_name": signer_name,
        "signer_role": signer_role,
        "verify_url": verify_url,
        "verify_token": verify_token,
        "verify_url_prefix": verify_url_prefix,
        "qr_image_src": _qr_png_data_uri(verify_url) if verify_url else "",
        "seal_hash": issue.seal_hash,
    }

    html = render_to_string("students/reports/certificate_studies_pdf.html", ctx)
    return render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))


def _store_issue_pdf(issue: CertificateIssue, pdf_bytes: bytes) -> str:
    filename = f"certificado_estudios_{issue.uuid}.pdf"
    relpath = PurePosixPath(str(settings.PRIVATE_REPORTS_DIR), "jobs", "certificates", filename).as_posix()
    abs_path = _safe_join_private(Path(settings.PRIVATE_STORAGE_ROOT), relpath)
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(pdf_bytes)

    issue.pdf_private_relpath = relpath
    issue.pdf_private_filename = filename
    issue.status = CertificateIssue.STATUS_ISSUED
    issue.save(update_fields=["pdf_private_relpath", "pdf_private_filename", "status"])
    return relpath


class Command(BaseCommand):
    help = (
        "Regenerate missing private PDFs for issued study certificates using the "
        "stored CertificateIssue payload. Runs in dry-run mode by default."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually write regenerated PDFs.")
        parser.add_argument("--limit", type=int, default=0, help="Process at most N issues (0 = no limit).")
        parser.add_argument("--uuid", dest="uuid", default="", help="Only process a specific CertificateIssue UUID.")

    def handle(self, *args, **options):
        apply = bool(options.get("apply"))
        limit = int(options.get("limit") or 0)
        uuid_filter = str(options.get("uuid") or "").strip()

        qs = CertificateIssue.objects.filter(status=CertificateIssue.STATUS_ISSUED).order_by("-issued_at")
        if uuid_filter:
            qs = qs.filter(uuid=uuid_filter)

        actionable: list[tuple[CertificateIssue, str, ReportJob | None]] = []
        already_available = 0
        recovered_candidates = 0

        for issue in qs.iterator():
            if _issue_private_pdf_exists(issue) or _issue_legacy_pdf_exists(issue):
                already_available += 1
                continue

            report_job = _find_recoverable_report_job(issue)
            if report_job is not None:
                recovered_candidates += 1
                actionable.append((issue, "recover", report_job))
            else:
                actionable.append((issue, "regenerate", None))

            if limit > 0 and len(actionable) >= limit:
                break

        self.stdout.write(self.style.MIGRATE_HEADING("backfill_certificate_issue_pdfs"))
        self.stdout.write(f"Already available: {already_available}")
        self.stdout.write(f"Recoverable from ReportJob: {recovered_candidates}")
        self.stdout.write(f"Missing and selected: {len(actionable)}")

        if not actionable:
            self.stdout.write("Nothing to do.")
            return

        if not apply:
            self.stdout.write("Dry-run: no changes applied. Use --apply to write regenerated PDFs.")
            for issue, mode, report_job in actionable[:5]:
                suffix = f" via ReportJob#{report_job.id}" if report_job is not None else ""
                self.stdout.write(f"- {issue.uuid} [{mode}]{suffix}")
            return

        recovered = 0
        regenerated = 0
        failed = 0

        for issue, mode, report_job in actionable:
            try:
                if mode == "recover" and report_job is not None:
                    issue.pdf_private_relpath = report_job.output_relpath
                    issue.pdf_private_filename = report_job.output_filename or f"certificado_estudios_{issue.uuid}.pdf"
                    issue.status = CertificateIssue.STATUS_ISSUED
                    issue.save(update_fields=["pdf_private_relpath", "pdf_private_filename", "status"])
                    recovered += 1
                    self.stdout.write(self.style.SUCCESS(f"Recovered {issue.uuid} from ReportJob#{report_job.id}"))
                    continue

                pdf_bytes = _render_certificate_pdf_bytes(issue)
                relpath = _store_issue_pdf(issue, pdf_bytes)
                regenerated += 1
                self.stdout.write(self.style.SUCCESS(f"Regenerated {issue.uuid} -> {relpath}"))
            except Exception as exc:
                failed += 1
                self.stdout.write(self.style.ERROR(f"Failed {issue.uuid}: {exc}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. recovered={recovered} regenerated={regenerated} failed={failed}"
            )
        )