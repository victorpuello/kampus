from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.db import transaction
from django.utils import timezone

from reports.models import ReportJob


def _safe_join_private(root: Path, relpath: str) -> Path:
    rel = Path(relpath)
    if rel.is_absolute():
        raise ValueError("Absolute paths are not allowed")

    final = (root / rel).resolve()
    root_resolved = root.resolve()
    if root_resolved not in final.parents and final != root_resolved:
        raise ValueError("Invalid path")
    return final


class Command(BaseCommand):
    help = "Delete expired/old report jobs and their private files."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Do not delete anything")
        parser.add_argument(
            "--older-than-hours",
            type=int,
            default=None,
            help="Delete finished jobs older than this (overrides default TTL)",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options["dry_run"])
        override_hours = options.get("older_than_hours")

        ttl_hours = int(getattr(settings, "REPORT_JOBS_TTL_HOURS", 24))
        if override_hours is not None:
            ttl_hours = int(override_hours)

        cutoff = timezone.now() - timezone.timedelta(hours=ttl_hours)

        # Prefer expires_at when present, otherwise use finished_at/created_at.
        # Use a single OR query (Q objects) to stay compatible with SQLite.
        to_delete = ReportJob.objects.filter(
            Q(expires_at__isnull=False, expires_at__lt=timezone.now())
            | Q(expires_at__isnull=True, finished_at__isnull=False, finished_at__lt=cutoff)
            | Q(expires_at__isnull=True, finished_at__isnull=True, created_at__lt=cutoff)
        ).order_by("id")

        base_root = Path(settings.PRIVATE_STORAGE_ROOT)
        deleted_jobs = 0
        deleted_files = 0

        for job in to_delete.iterator():
            if job.output_relpath:
                try:
                    abs_path = _safe_join_private(base_root, job.output_relpath)
                except ValueError:
                    abs_path = None

                if abs_path and abs_path.exists():
                    deleted_files += 1
                    if not dry_run:
                        try:
                            abs_path.unlink(missing_ok=True)
                        except TypeError:
                            # Python < 3.8 compatibility (shouldn't happen here, but safe)
                            if abs_path.exists():
                                abs_path.unlink()

            deleted_jobs += 1
            if not dry_run:
                with transaction.atomic():
                    ReportJob.objects.filter(id=job.id).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"cleanup_report_jobs: jobs={deleted_jobs} files={deleted_files} dry_run={dry_run}"
            )
        )
