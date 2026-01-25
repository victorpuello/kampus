from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Retire enrollments that are still ACTIVE in AcademicYears marked as CLOSED. "
        "Useful as a one-off data cleanup in existing databases."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only prints how many records would be updated.",
        )
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Optional numeric year to target (e.g. 2025).",
        )

    def handle(self, *args, **options):
        from academic.models import AcademicYear
        from students.models import Enrollment

        dry_run = bool(options["dry_run"])
        year = options.get("year")

        years_qs = AcademicYear.objects.filter(status=AcademicYear.STATUS_CLOSED)
        if year is not None:
            years_qs = years_qs.filter(year=int(year))

        year_ids = list(years_qs.values_list("id", flat=True))
        if not year_ids:
            self.stdout.write("No CLOSED academic years found for the given filter.")
            return

        qs = Enrollment.objects.filter(academic_year_id__in=year_ids, status="ACTIVE")
        total = qs.count()

        self.stdout.write(
            f"Found {total} ACTIVE enrollments in CLOSED academic year(s)" + (
                f" (year={year})" if year is not None else ""
            )
        )

        if dry_run:
            self.stdout.write("Dry-run: no updates applied.")
            return

        updated = qs.update(status="RETIRED")
        self.stdout.write(f"Updated {updated} enrollment(s) to RETIRED.")
