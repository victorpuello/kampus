from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import CharField, Exists, OuterRef
from django.db.models.functions import Cast

from students.models import CertificateIssue

from verification.models import VerifiableDocument
from verification.services import get_or_create_for_certificate_issue


class Command(BaseCommand):
    help = (
        "Backfill VerifiableDocument rows for historical documents (safe/idempotent). "
        "By default it runs in dry-run mode. Use --apply to write changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually create missing VerifiableDocument rows (default: dry-run).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Process at most N rows (0 = no limit).",
        )
        parser.add_argument(
            "--only-issued",
            action="store_true",
            default=True,
            help="Only process issued certificates (default: true).",
        )

    def handle(self, *args, **options):
        apply = bool(options.get("apply"))
        limit = int(options.get("limit") or 0)

        # Select CertificateIssue rows missing a VerifiableDocument.
        # We compare against VerifiableDocument.object_id, which stores str(uuid).
        qs = CertificateIssue.objects.all()
        if options.get("only_issued", True):
            qs = qs.filter(status=CertificateIssue.STATUS_ISSUED)

        qs = qs.annotate(uuid_str=Cast("uuid", output_field=CharField()))
        vdoc_exists = VerifiableDocument.objects.filter(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            object_type="CertificateIssue",
            object_id=OuterRef("uuid_str"),
        )
        qs = qs.annotate(has_vdoc=Exists(vdoc_exists)).filter(has_vdoc=False).order_by("-issued_at")

        if limit > 0:
            qs = qs[:limit]

        to_process = list(qs)
        self.stdout.write(f"Found {len(to_process)} certificate issue(s) without VerifiableDocument.")
        if not to_process:
            return

        if not apply:
            self.stdout.write("Dry-run: no changes written. Use --apply to create missing rows.")
            # Show a small sample for operator confidence.
            sample = to_process[:5]
            for issue in sample:
                self.stdout.write(f"- {issue.uuid} (issued_at={issue.issued_at}, status={issue.status})")
            return

        created = 0
        for issue in to_process:
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

            get_or_create_for_certificate_issue(
                issue_uuid=str(issue.uuid),
                public_payload=public_payload,
                seal_hash=getattr(issue, "seal_hash", "") or "",
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} VerifiableDocument row(s)."))
