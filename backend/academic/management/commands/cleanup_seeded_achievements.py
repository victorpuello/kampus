from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from academic.models import Achievement, AchievementGrade


DEFAULT_SEED_DESCRIPTIONS = {
    "Cognitivo 1",
    "Cognitivo 2",
    "Procedimental 1",
    "Procedimental 2",
    "Actitudinal 1",
    "Actitudinal 2",
}


class Command(BaseCommand):
    help = (
        "Cleans up seed-created duplicate achievements for a specific academic_load/group/period. "
        "Only deletes achievements that have no AchievementGrade rows (no scores recorded)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--academic-load", type=int, required=True)
        parser.add_argument("--group", type=int, required=True)
        parser.add_argument("--period", type=int, required=True)
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete. Without this flag it's a dry-run.",
        )
        parser.add_argument(
            "--descriptions",
            type=str,
            default=None,
            help=(
                "Comma-separated descriptions to target. Defaults to the standard seed ones: "
                "Cognitivo 1/2, Procedimental 1/2, Actitudinal 1/2."
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        academic_load_id: int = options["academic_load"]
        group_id: int = options["group"]
        period_id: int = options["period"]
        apply: bool = options["apply"]
        raw_desc: str | None = options["descriptions"]

        if raw_desc:
            descriptions = {d.strip() for d in raw_desc.split(",") if d.strip()}
        else:
            descriptions = set(DEFAULT_SEED_DESCRIPTIONS)

        qs = Achievement.objects.filter(
            academic_load_id=academic_load_id,
            group_id=group_id,
            period_id=period_id,
            description__in=descriptions,
        ).order_by("id")

        if not qs.exists():
            self.stdout.write("No matching achievements found.")
            return

        to_delete = []
        blocked = []
        for a in qs:
            has_grades = AchievementGrade.objects.filter(achievement_id=a.id).exists()
            if has_grades:
                blocked.append(a)
            else:
                to_delete.append(a)

        self.stdout.write(
            f"Found {qs.count()} matching achievements. deletable={len(to_delete)} blocked_with_grades={len(blocked)}"
        )

        if blocked:
            self.stdout.write("Blocked (has grades):")
            for a in blocked:
                self.stdout.write(f"- {a.id}: {a.description}")

        if not apply:
            self.stdout.write("Dry-run. Use --apply to delete.")
            self.stdout.write("Would delete:")
            for a in to_delete:
                self.stdout.write(f"- {a.id}: {a.description}")
            return

        deleted = 0
        for a in to_delete:
            a.delete()
            deleted += 1

        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted} achievements."))
