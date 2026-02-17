from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from academic.models import Achievement, AchievementDefinition


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").split()).strip().lower()


def make_key(subject_id: int | None, grade_id: int | None, dimension_id: int | None, description: str | None) -> tuple[int | None, int | None, int | None, str]:
    return (subject_id, grade_id, dimension_id, normalize_text(description))


@dataclass
class ResolutionPlan:
    achievement_id: int
    current_definition_id: int | None
    target_definition_id: int | None
    action: str
    reason: str


class Command(BaseCommand):
    help = (
        "Align Achievement.definition with canonical bank entries and create missing AchievementDefinition records "
        "without duplication. Defaults to dry-run; use --apply to persist."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist remediation changes. Without this flag, command runs in dry-run mode.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Optional limit of achievements to inspect (ordered by id).",
        )
        parser.add_argument(
            "--achievement-id",
            type=int,
            action="append",
            dest="achievement_ids",
            help="Filter to one or more specific Achievement IDs. Can be passed multiple times.",
        )
        parser.add_argument(
            "--owner-username",
            default=None,
            help="Optional username to set as created_by for newly created bank definitions.",
        )
        parser.add_argument(
            "--sample-size",
            type=int,
            default=25,
            help="How many planned/applied rows to print as sample.",
        )

    def handle(self, *args, **options):
        apply_changes: bool = bool(options["apply"])
        limit: int | None = options.get("limit")
        achievement_ids: list[int] | None = options.get("achievement_ids")
        owner_username: str | None = options.get("owner_username")
        sample_size: int = int(options["sample_size"])

        owner_user = None
        if owner_username:
            User = get_user_model()
            try:
                owner_user = User.objects.get(username=owner_username)
            except User.DoesNotExist as exc:
                raise CommandError(f"owner-username no existe: {owner_username}") from exc

        definitions = list(
            AchievementDefinition.objects.select_related("created_by").order_by("id")
        )
        definition_by_id = {d.id: d for d in definitions}
        key_to_definition_id: dict[tuple[int | None, int | None, int | None, str], int] = {}
        for definition in definitions:
            key = make_key(
                definition.subject_id,
                definition.grade_id,
                definition.dimension_id,
                definition.description,
            )
            if key not in key_to_definition_id:
                key_to_definition_id[key] = definition.id

        achievements_qs = Achievement.objects.select_related("group", "definition", "subject", "dimension").order_by("id")
        if achievement_ids:
            achievements_qs = achievements_qs.filter(id__in=achievement_ids)
        if limit:
            achievements_qs = achievements_qs[:limit]

        inspected = 0
        skipped_missing_context = 0
        already_aligned = 0
        needs_remediation = 0
        planned_create = 0
        planned_relink = 0

        plans: list[ResolutionPlan] = []
        created_definition_ids: set[int] = set()
        next_temp_definition_id = -1

        for achievement in achievements_qs:
            inspected += 1

            if not achievement.subject_id or not achievement.group_id:
                skipped_missing_context += 1
                continue

            grade_id = achievement.group.grade_id if achievement.group else None
            desired_key = make_key(
                achievement.subject_id,
                grade_id,
                achievement.dimension_id,
                achievement.description,
            )

            current_definition = achievement.definition
            current_key = None
            if current_definition is not None:
                current_key = make_key(
                    current_definition.subject_id,
                    current_definition.grade_id,
                    current_definition.dimension_id,
                    current_definition.description,
                )

            if current_definition is not None and current_key == desired_key:
                already_aligned += 1
                continue

            needs_remediation += 1

            target_definition_id = key_to_definition_id.get(desired_key)
            reason = "missing_definition" if current_definition is None else "mismatch_definition_context"
            previous_definition_id = achievement.definition_id
            created_now = False

            if target_definition_id is None:
                planned_create += 1
                if apply_changes:
                    created = AchievementDefinition.objects.create(
                        description=(achievement.description or "").strip(),
                        area=achievement.subject.area if achievement.subject else None,
                        grade_id=grade_id,
                        subject_id=achievement.subject_id,
                        dimension_id=achievement.dimension_id,
                        is_active=True,
                        created_by=owner_user,
                    )
                    target_definition_id = created.id
                    definition_by_id[created.id] = created
                    key_to_definition_id[desired_key] = created.id
                    created_definition_ids.add(created.id)
                    created_now = True
                else:
                    target_definition_id = next_temp_definition_id
                    key_to_definition_id[desired_key] = target_definition_id
                    next_temp_definition_id -= 1
                    created_now = True

            if target_definition_id is not None and achievement.definition_id != target_definition_id:
                planned_relink += 1
                if apply_changes:
                    achievement.definition_id = target_definition_id
                    achievement.save(update_fields=["definition"])

            plans.append(
                ResolutionPlan(
                    achievement_id=achievement.id,
                    current_definition_id=previous_definition_id,
                    target_definition_id=target_definition_id,
                    action="create_and_relink" if (created_now or target_definition_id in created_definition_ids) else "relink",
                    reason=reason,
                )
            )

        mode = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write(self.style.MIGRATE_HEADING(f"[remediate_achievement_bank_links] mode={mode}"))
        self.stdout.write(
            f"inspected={inspected}, skipped_missing_context={skipped_missing_context}, "
            f"already_aligned={already_aligned}, needs_remediation={needs_remediation}, "
            f"planned_create={planned_create}, planned_relink={planned_relink}"
        )

        sample = plans[:sample_size]
        if sample:
            self.stdout.write(self.style.NOTICE(f"Sample rows ({len(sample)}):"))
            for item in sample:
                self.stdout.write(
                    f"  achievement={item.achievement_id} current_def={item.current_definition_id} "
                    f"target_def={item.target_definition_id} action={item.action} reason={item.reason}"
                )

        if not apply_changes:
            self.stdout.write(self.style.WARNING("Dry-run complete. Run with --apply to persist changes."))
        else:
            self.stdout.write(self.style.SUCCESS("Apply complete."))
