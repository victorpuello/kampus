from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from academic.management.commands.seed_gradebook_prereqs import _parse_dimensions
from academic.models import Achievement, Dimension, Period, TeacherAssignment


class Command(BaseCommand):
    help = "Seeds gradebook dimensions + achievements for a specific TeacherAssignment + Period."

    def add_arguments(self, parser):
        parser.add_argument("--teacher-assignment", type=int, required=True)
        parser.add_argument("--period", type=int, required=True)
        parser.add_argument(
            "--dimensions",
            type=str,
            default=None,
            help=(
                "Dimensions to create/use for the AcademicYear, as comma-separated 'Name:Percentage'. "
                "Default: 'Cognitivo:50,Procedimental:30,Actitudinal:20'."
            ),
        )
        parser.add_argument(
            "--achievements-per-dimension",
            type=int,
            default=1,
            help="How many achievements to seed per dimension (default: 1)",
        )
        parser.add_argument(
            "--update-existing-dimensions",
            action="store_true",
            help=(
                "If set, updates percentage/is_active for existing Dimension records to match --dimensions. "
                "By default, existing Dimension configuration is preserved."
            ),
        )
        parser.add_argument(
            "--group-null",
            action="store_true",
            help="If set, create achievements with group=NULL (applies to any group for that load).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        ta_id: int = options["teacher_assignment"]
        period_id: int = options["period"]
        dims_spec: str | None = options["dimensions"]
        achievements_per_dimension: int = options["achievements_per_dimension"]
        group_null: bool = options["group_null"]
        update_existing_dimensions: bool = options["update_existing_dimensions"]

        if achievements_per_dimension <= 0:
            self.stdout.write(self.style.WARNING("Nothing to do: --achievements-per-dimension must be > 0"))
            return

        teacher_assignment = TeacherAssignment.objects.select_related(
            "academic_year",
            "group",
            "academic_load__subject",
        ).get(id=ta_id)
        period = Period.objects.select_related("academic_year").get(id=period_id)

        if period.academic_year_id != teacher_assignment.academic_year_id:
            raise ValueError("Period academic_year does not match TeacherAssignment academic_year")

        dims = _parse_dimensions(dims_spec)

        # Ensure dimensions exist
        dimension_objs: list[Dimension] = []
        for name, pct in dims:
            obj, _ = Dimension.objects.get_or_create(
                academic_year=teacher_assignment.academic_year,
                name=name,
                defaults={"description": "", "percentage": pct, "is_active": True},
            )
            if update_existing_dimensions:
                updated_fields = []
                if int(obj.percentage) != int(pct):
                    obj.percentage = pct
                    updated_fields.append("percentage")
                if not obj.is_active:
                    obj.is_active = True
                    updated_fields.append("is_active")
                if updated_fields:
                    obj.save(update_fields=updated_fields)
            dimension_objs.append(obj)

        created = 0
        updated = 0

        group_value = None if group_null else teacher_assignment.group
        subject = teacher_assignment.academic_load.subject if teacher_assignment.academic_load else None

        # Create achievements under each dimension
        for dim in dimension_objs:
            base = 100 // achievements_per_dimension
            rem = 100 % achievements_per_dimension
            for i in range(achievements_per_dimension):
                pct = base + (1 if i < rem else 0)
                desc = f"{dim.name} {i + 1}"
                obj, was_created = Achievement.objects.get_or_create(
                    academic_load=teacher_assignment.academic_load,
                    period=period,
                    group=group_value,
                    description=desc,
                    defaults={
                        "subject": subject,
                        "dimension": dim,
                        "percentage": pct,
                    },
                )
                if was_created:
                    created += 1
                    continue

                changed = []
                if obj.dimension_id != dim.id:
                    obj.dimension = dim
                    changed.append("dimension")
                if int(obj.percentage) != int(pct):
                    obj.percentage = pct
                    changed.append("percentage")
                if subject and obj.subject_id != subject.id:
                    obj.subject = subject
                    changed.append("subject")
                if changed:
                    obj.save(update_fields=changed)
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded gradebook for assignment/period: "
                f"teacher_assignment={teacher_assignment.id}, period={period.id}, "
                f"dimensions={len(dimension_objs)}, achievements_created={created}, achievements_updated={updated}."
            )
        )
