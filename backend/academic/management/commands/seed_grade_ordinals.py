from __future__ import annotations

from django.core.management.base import BaseCommand

from academic.grade_ordinals import guess_ordinal
from academic.models import Grade


class Command(BaseCommand):
    help = "Populate Grade.ordinal for common Colombian grade names (Jardín → 11)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print what would change; do not write to the database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite ordinal even if already set.",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options["dry_run"])
        force: bool = bool(options["force"])

        updated = 0
        skipped = 0
        unknown = 0

        for grade in Grade.objects.all().order_by("id"):
            guessed = guess_ordinal(grade.name)
            if guessed is None:
                unknown += 1
                self.stdout.write(self.style.WARNING(f"[UNKNOWN] Grade(id={grade.id}) name='{grade.name}'"))
                continue

            if (grade.ordinal is not None) and not force:
                skipped += 1
                continue

            if not dry_run:
                grade.ordinal = guessed
                grade.save(update_fields=["ordinal"])

            updated += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"[SET] Grade(id={grade.id}) name='{grade.name}' -> ordinal={guessed}{' (dry-run)' if dry_run else ''}"
                )
            )

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Done. updated={updated}, skipped={skipped}, unknown={unknown}, dry_run={dry_run}, force={force}"
            )
        )
