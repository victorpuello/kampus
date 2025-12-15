from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from academic.models import AcademicLoad, AcademicYear, Area, Group, Period, Subject, TeacherAssignment, Achievement


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
                        obj, was_created = Achievement.objects.get_or_create(
                            academic_load=load,
                            period=period,
                            description=desc,
                            defaults={"percentage": pct, "group": None, "subject": subject},
                        )
                        # Keep percentage stable if record exists
                        if not was_created and obj.percentage != pct:
                            obj.percentage = pct
                            obj.save(update_fields=["percentage"])
                        if was_created:
                            created_achievements += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded gradebook prereqs for year {year.year}: periods={len(existing_periods)}, groups={len(groups)}, "
                f"assignments+={created_assignments}, achievements+={created_achievements}."
            )
        )
