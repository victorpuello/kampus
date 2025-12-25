from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from academic.grading import DEFAULT_EMPTY_SCORE, weighted_average
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
        "Migrates grades from duplicated seed achievements (e.g. Cognitivo 1/2) into the single planned achievement "
        "per dimension for a given academic_load/group/period, then optionally deletes the seed achievements."
    )

    def add_arguments(self, parser):
        parser.add_argument("--academic-load", type=int, required=True)
        parser.add_argument("--group", type=int, required=True)
        parser.add_argument("--period", type=int, required=True)
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write changes. Without this flag it's a dry-run.",
        )
        parser.add_argument(
            "--delete-seeded",
            action="store_true",
            help="If set (and --apply), deletes the seed achievements after migrating grades.",
        )
        parser.add_argument(
            "--seed-descriptions",
            type=str,
            default=None,
            help=(
                "Comma-separated descriptions to treat as seeded duplicates. Defaults to: "
                "Cognitivo 1/2, Procedimental 1/2, Actitudinal 1/2."
            ),
        )

    def _seed_set(self, raw: str | None) -> set[str]:
        if not raw:
            return set(DEFAULT_SEED_DESCRIPTIONS)
        return {x.strip() for x in raw.split(",") if x.strip()}

    @transaction.atomic
    def handle(self, *args, **options):
        academic_load_id: int = options["academic_load"]
        group_id: int = options["group"]
        period_id: int = options["period"]
        apply: bool = options["apply"]
        delete_seeded: bool = options["delete_seeded"]
        seed_descriptions = self._seed_set(options["seed_descriptions"])

        scope = dict(academic_load_id=academic_load_id, group_id=group_id, period_id=period_id)

        seeded = list(
            Achievement.objects.filter(**scope, description__in=seed_descriptions)
            .select_related("dimension")
            .order_by("id")
        )
        if not seeded:
            self.stdout.write("No seeded duplicate achievements found in scope.")
            return

        # Target = single non-seeded achievement per dimension (same scope)
        dims = sorted({a.dimension_id for a in seeded if a.dimension_id is not None})
        targets: dict[int, Achievement] = {}
        for dim_id in dims:
            candidates = list(
                Achievement.objects.filter(**scope, dimension_id=dim_id)
                .exclude(description__in=seed_descriptions)
                .order_by("id")
            )
            if len(candidates) != 1:
                dim_name = next((a.dimension.name for a in seeded if a.dimension_id == dim_id and a.dimension), str(dim_id))
                raise ValueError(
                    f"Expected exactly 1 planned (non-seeded) achievement for dimension '{dim_name}' (id={dim_id}) in scope, found {len(candidates)}. "
                    "Fix duplicates or specify a different seed set."
                )
            targets[dim_id] = candidates[0]

        seeded_ids = [a.id for a in seeded]
        grades_qs = AchievementGrade.objects.filter(achievement_id__in=seeded_ids).only(
            "id", "gradesheet_id", "enrollment_id", "achievement_id", "score"
        )

        # Group grades by (gradesheet, enrollment, dimension)
        seeded_by_id = {a.id: a for a in seeded}
        bucket: dict[tuple[int, int, int], list[tuple[Decimal | None, int | None]]] = defaultdict(list)
        seen_cells = 0
        for g in grades_qs.iterator():
            ach = seeded_by_id.get(g.achievement_id)
            if not ach or not ach.dimension_id:
                continue
            key = (g.gradesheet_id, g.enrollment_id, ach.dimension_id)
            weight = int(ach.percentage) if ach.percentage else 1
            bucket[key].append((g.score, weight))
            seen_cells += 1

        self.stdout.write(
            f"Seeded achievements in scope: {len(seeded)} (ids={seeded_ids}). Found {seen_cells} grade cells to migrate."
        )

        # Prepare upserts into target achievements
        upserts: list[AchievementGrade] = []
        for (gradesheet_id, enrollment_id, dim_id), items in bucket.items():
            # Mirror gradebook behavior: None scores are treated as 1.00
            normalized = [(DEFAULT_EMPTY_SCORE if s is None else s, w) for (s, w) in items]
            merged_score = weighted_average(normalized)
            target = targets[dim_id]
            upserts.append(
                AchievementGrade(
                    gradesheet_id=gradesheet_id,
                    enrollment_id=enrollment_id,
                    achievement_id=target.id,
                    score=merged_score,
                )
            )

        self.stdout.write(f"Will upsert {len(upserts)} merged grades into planned achievements.")
        for dim_id, target in targets.items():
            dim_name = target.dimension.name if target.dimension else str(dim_id)
            self.stdout.write(f"- Target for {dim_name}: Achievement {target.id} '{target.description}'")

        if not apply:
            self.stdout.write("Dry-run. Use --apply to write changes.")
            return

        with transaction.atomic():
            if upserts:
                AchievementGrade.objects.bulk_create(
                    upserts,
                    update_conflicts=True,
                    unique_fields=["gradesheet", "enrollment", "achievement"],
                    update_fields=["score", "updated_at"],
                )

            # Delete old seeded grade cells (they are now merged)
            deleted_cells, _ = AchievementGrade.objects.filter(achievement_id__in=seeded_ids).delete()

            deleted_achievements = 0
            if delete_seeded:
                deleted_achievements, _ = Achievement.objects.filter(id__in=seeded_ids).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Migration complete. upserted={len(upserts)} deleted_seed_grade_cells={deleted_cells} "
                f"deleted_seed_achievements={deleted_achievements}"
            )
        )
