from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from academic.models import (
    AcademicLoad,
    AcademicYear,
    Achievement,
    Area,
    Dimension,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)


def _parse_dimensions(raw: str | None) -> list[tuple[str, int]]:
    """Parse dimensions string like: "Cognitivo:50,Procedimental:30,Actitudinal:20"."""
    if not raw:
        return [("Cognitivo", 50), ("Procedimental", 30), ("Actitudinal", 20)]

    dims: list[tuple[str, int]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" not in part:
            raise ValueError(
                "Invalid --dimensions format. Expected 'Name:Percentage' comma-separated, e.g. 'Cognitivo:50,Procedimental:30,Actitudinal:20'."
            )
        name, pct = part.split(":", 1)
        name = name.strip()
        pct = int(pct.strip())
        if not name:
            raise ValueError("Dimension name cannot be empty")
        if pct < 0:
            raise ValueError("Dimension percentage must be >= 0")
        dims.append((name, pct))

    if not dims:
        return [("Cognitivo", 50), ("Procedimental", 30), ("Actitudinal", 20)]
    return dims


class Command(BaseCommand):
    help = "Seeds minimal academic prerequisites for the gradebook UI (periods, teacher assignments, achievements)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Target AcademicYear.year (defaults to ACTIVE year, else current year)",
        )
        parser.add_argument(
            "--teacher-username",
            type=str,
            default="teacher1",
            help="Teacher username to create/use (default: teacher1)",
        )
        parser.add_argument(
            "--teacher-email",
            type=str,
            default="teacher1@kampus.com",
            help="Teacher email to create/use (default: teacher1@kampus.com)",
        )
        parser.add_argument(
            "--teacher-password",
            type=str,
            default="teacher123",
            help="Teacher password (default: teacher123)",
        )
        parser.add_argument(
            "--subject-name",
            type=str,
            default="Matemáticas",
            help="Subject name to create/use for AcademicLoads (default: Matemáticas)",
        )
        parser.add_argument(
            "--area-name",
            type=str,
            default="Matemáticas",
            help="Area name to create/use for Subject (default: Matemáticas)",
        )
        parser.add_argument(
            "--periods",
            type=int,
            default=4,
            help="How many periods to create if missing (default: 4)",
        )
        parser.add_argument(
            "--achievements-per-period",
            type=int,
            default=3,
            help="How many achievements to create per AcademicLoad per Period (default: 3)",
        )
        parser.add_argument(
            "--dimensions",
            type=str,
            default=None,
            help=(
                "Dimensions to create/use for this AcademicYear, as comma-separated 'Name:Percentage'. "
                "Default: 'Cognitivo:50,Procedimental:30,Actitudinal:20'."
            ),
        )
        parser.add_argument(
            "--update-existing-dimensions",
            action="store_true",
            help=(
                "If set, updates percentage/is_active for existing Dimension records to match --dimensions. "
                "By default, existing Dimension configuration is preserved."
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        target_year: int | None = options["year"]
        teacher_username: str = options["teacher_username"]
        teacher_email: str = options["teacher_email"]
        teacher_password: str = options["teacher_password"]
        subject_name: str = options["subject_name"]
        area_name: str = options["area_name"]
        periods_count: int = options["periods"]
        achievements_per_period: int = options["achievements_per_period"]
        dims_spec: str | None = options["dimensions"]
        update_existing_dimensions: bool = options["update_existing_dimensions"]

        if target_year is not None:
            year = AcademicYear.objects.get(year=target_year)
        else:
            year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
            if year is None:
                year, _ = AcademicYear.objects.get_or_create(
                    year=date.today().year,
                    defaults={"status": AcademicYear.STATUS_ACTIVE},
                )

        groups = list(Group.objects.filter(academic_year=year).select_related("grade").order_by("grade__name", "name"))
        if not groups:
            self.stdout.write(self.style.WARNING("No groups found for this AcademicYear. Create groups first."))
            return

        # Dimensions
        dims = _parse_dimensions(dims_spec)
        dimension_objs: list[Dimension] = []
        for name, pct in dims:
            obj, _ = Dimension.objects.get_or_create(
                academic_year=year,
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

        # Periods
        existing_periods = list(Period.objects.filter(academic_year=year).order_by("start_date"))
        if not existing_periods:
            # Simple sequential windows; dates are not used for logic beyond ordering.
            starts = [date(year.year, 2, 1), date(year.year, 4, 16), date(year.year, 7, 15), date(year.year, 9, 16)]
            ends = [date(year.year, 4, 15), date(year.year, 6, 30), date(year.year, 9, 15), date(year.year, 11, 30)]
            for i in range(min(periods_count, 4)):
                Period.objects.get_or_create(
                    academic_year=year,
                    name=f"Periodo {i + 1}",
                    defaults={"start_date": starts[i], "end_date": ends[i], "is_closed": False},
                )
            existing_periods = list(Period.objects.filter(academic_year=year).order_by("start_date"))

        # Teacher
        User = get_user_model()
        teacher, created = User.objects.get_or_create(
            email=teacher_email,
            defaults={
                "username": teacher_username,
                "first_name": "Docente",
                "last_name": "Demo",
                "role": "TEACHER",
                "is_active": True,
            },
        )
        if created:
            teacher.set_password(teacher_password)
            teacher.save()

        # Subject + area
        area, _ = Area.objects.get_or_create(name=area_name, defaults={"description": ""})
        subject, _ = Subject.objects.get_or_create(name=subject_name, defaults={"area": area})

        # AcademicLoads per grade
        grades = {g.grade for g in groups}
        loads_by_grade_id: dict[int, AcademicLoad] = {}
        for grade in sorted(grades, key=lambda gr: (gr.name, gr.id)):
            load, _ = AcademicLoad.objects.get_or_create(
                subject=subject,
                grade=grade,
                defaults={"weight_percentage": 100, "hours_per_week": 4},
            )
            loads_by_grade_id[grade.id] = load

        # TeacherAssignment per group
        created_assignments = 0
        for group in groups:
            load = loads_by_grade_id[group.grade_id]
            _, was_created = TeacherAssignment.objects.get_or_create(
                teacher=teacher,
                academic_load=load,
                group=group,
                academic_year=year,
            )
            if was_created:
                created_assignments += 1

        # Achievements per load/period (group-null so they apply to the group via academic_load)
        created_achievements = 0
        if achievements_per_period > 0:
            for load in loads_by_grade_id.values():
                for period in existing_periods:
                    # Use deterministic percentages that sum to 100
                    base = 100 // achievements_per_period
                    rem = 100 % achievements_per_period
                    for i in range(achievements_per_period):
                        pct = base + (1 if i < rem else 0)
                        desc = f"Logro {i + 1} ({subject.name})"
                        assigned_dimension = None
                        if dimension_objs:
                            assigned_dimension = dimension_objs[i % len(dimension_objs)]
                        obj, was_created = Achievement.objects.get_or_create(
                            academic_load=load,
                            period=period,
                            description=desc,
                            defaults={
                                "percentage": pct,
                                "group": None,
                                "subject": subject,
                                "dimension": assigned_dimension,
                            },
                        )
                        # Keep percentage stable if record exists
                        updated_fields = []
                        if int(obj.percentage) != int(pct):
                            obj.percentage = pct
                            updated_fields.append("percentage")
                        if assigned_dimension and obj.dimension_id != assigned_dimension.id:
                            obj.dimension = assigned_dimension
                            updated_fields.append("dimension")
                        if updated_fields:
                            obj.save(update_fields=updated_fields)
                        if was_created:
                            created_achievements += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded gradebook prereqs for year {year.year}: periods={len(existing_periods)}, groups={len(groups)}, "
                f"dimensions={len(dimension_objs)}, assignments+={created_assignments}, achievements+={created_achievements}."
            )
        )
