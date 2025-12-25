from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from academic.models import AcademicLoad, Achievement


class Command(BaseCommand):
    help = "Backfills Achievement.academic_load when missing, using (subject + group.grade)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without saving.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Optional limit for how many achievements to process (0 = no limit).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        limit: int = int(options["limit"] or 0)

        qs = Achievement.objects.select_related("subject", "group__grade").filter(
            academic_load__isnull=True,
            subject__isnull=False,
            group__isnull=False,
        ).order_by("id")

        if limit > 0:
            qs = qs[:limit]

        total = qs.count() if limit <= 0 else len(list(qs))
        self.stdout.write(f"Found {total} achievements missing academic_load.")

        updated = 0
        skipped = 0
        for a in qs:
            if not a.subject_id or not a.group_id:
                skipped += 1
                continue

            load = AcademicLoad.objects.filter(subject_id=a.subject_id, grade_id=a.group.grade_id).first()
            if not load:
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping Achievement {a.id}: no AcademicLoad for subject_id={a.subject_id} grade_id={a.group.grade_id}"
                    )
                )
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"Would set Achievement {a.id} academic_load={load.id} ({load})"
                )
                updated += 1
                continue

            a.academic_load_id = load.id
            a.save(update_fields=["academic_load"])
            updated += 1

        msg = f"Backfill complete. updated={updated}, skipped={skipped}, dry_run={dry_run}"
        self.stdout.write(self.style.SUCCESS(msg))
