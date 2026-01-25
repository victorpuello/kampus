from __future__ import annotations

from django.core.management.base import BaseCommand

from students.services.observer_annotations import maybe_generate_group_period_annotations


class Command(BaseCommand):
    help = "Debug: run observer annotation auto-generation for a GradeSheet id."

    def add_arguments(self, parser):
        parser.add_argument("--gradesheet-id", type=int, required=True)

    def handle(self, *args, **options):
        gradesheet_id = int(options["gradesheet_id"])
        self.stdout.write(f"start gradesheet_id={gradesheet_id}")
        maybe_generate_group_period_annotations(gradesheet_id=gradesheet_id)
        self.stdout.write("end")
