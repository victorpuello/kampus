from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academic.models import AcademicYear, Grade, Group
from students.models import Enrollment, Student


@dataclass(frozen=True)
class GroupAllocation:
    group_id: int
    count: int


def _allocations(total: int, groups: list[Group]) -> list[GroupAllocation]:
    if total < 0:
        raise ValueError("total must be >= 0")

    if not groups:
        return []

    n = len(groups)
    base = total // n
    rem = total % n

    result: list[GroupAllocation] = []
    for i, g in enumerate(groups):
        result.append(GroupAllocation(group_id=g.id, count=base + (1 if i < rem else 0)))
    return result


class Command(BaseCommand):
    help = "Seeds student users + students + enrollments distributed across all groups."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=389,
            help="Total students to create (default: 389)",
        )
        parser.add_argument(
            "--bootstrap-only",
            action="store_true",
            help="Only create AcademicYear/Grades/Groups prerequisites (no students/enrollments)",
        )
        parser.add_argument(
            "--username-prefix",
            type=str,
            default="seed_student_",
            help="Username prefix for seeded students (default: seed_student_)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="Kampus123!",
            help="Password for seeded student users (default: Kampus123!)",
        )
        parser.add_argument(
            "--run",
            action="store_true",
            help="Actually write to the database (otherwise prints a plan only)",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete previously seeded users matching --username-prefix before seeding",
        )
        parser.add_argument(
            "--group-name",
            type=str,
            default="A",
            help="Group name to use when creating one group per grade (default: A)",
        )
        parser.add_argument(
            "--academic-year",
            type=int,
            default=None,
            help="AcademicYear.year to target (defaults to ACTIVE year, else creates current year)",
        )
        parser.add_argument(
            "--create-default-grades",
            action="store_true",
            help="If no grades exist, create a default set (Transición, 1..11)",
        )

    def handle(self, *args, **options):
        total: int = options["count"]
        bootstrap_only: bool = options["bootstrap_only"]
        username_prefix: str = options["username_prefix"]
        password: str = options["password"]
        run: bool = options["run"]
        reset: bool = options["reset"]
        group_name: str = options["group_name"]
        target_year: int | None = options["academic_year"]
        create_default_grades: bool = options["create_default_grades"]

        if total <= 0 and not bootstrap_only:
            raise CommandError("--count must be > 0 (or use --bootstrap-only)")

        academic_year = None
        if target_year is not None:
            academic_year = AcademicYear.objects.filter(year=target_year).first()
            if academic_year is None:
                raise CommandError(f"AcademicYear {target_year} not found")
        else:
            academic_year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
            if academic_year is None:
                academic_year, _ = AcademicYear.objects.get_or_create(
                    year=date.today().year,
                    defaults={"status": AcademicYear.STATUS_ACTIVE},
                )

        grades = list(Grade.objects.order_by("name", "id"))
        if not grades and create_default_grades:
            # Minimal conventional set (can be overridden by creating real grades)
            defaults = ["Transición"] + [str(i) for i in range(1, 12)]
            for name in defaults:
                Grade.objects.get_or_create(name=name)
            grades = list(Grade.objects.order_by("name", "id"))

        if not grades:
            raise CommandError(
                "No grades found. Create grades first, or re-run with --create-default-grades."
            )

        # Ensure one group per grade for the chosen academic year.
        # This matches: "crea un grupo por cada grado".
        if run:
            for grade in grades:
                Group.objects.get_or_create(
                    name=group_name,
                    grade=grade,
                    academic_year=academic_year,
                    defaults={"shift": "MORNING", "capacity": 40},
                )

        groups = list(
            Group.objects.filter(academic_year=academic_year)
            .select_related("grade", "academic_year", "campus")
            .order_by("grade__name", "name", "id")
        )

        if not groups:
            raise CommandError(
                "No groups found for the selected academic year. Run with --run to create them."
            )

        allocs = _allocations(total, groups)

        self.stdout.write(
            f"AcademicYear: {academic_year.year} | Groups: {len(groups)} | Students: {total} | Mode: {'RUN' if run else 'PLAN'}"
        )
        for a in allocs:
            g = next(gr for gr in groups if gr.id == a.group_id)
            self.stdout.write(
                f"- Group {g.id}: {g.grade} {g.name} ({g.academic_year.year}) => {a.count}"
            )

        if not run:
            self.stdout.write(
                self.style.WARNING(
                    "Dry plan only. Re-run with --run to create groups/students (optionally --reset)."
                )
            )
            return

        if bootstrap_only:
            self.stdout.write(self.style.SUCCESS("Bootstrap complete (AcademicYear/Grades/Groups)."))
            return

        User = get_user_model()

        if reset:
            seed_users = User.objects.filter(username__startswith=username_prefix)
            deleted = seed_users.count()
            seed_users.delete()
            self.stdout.write(self.style.WARNING(f"Reset: deleted {deleted} users (cascade)."))

        # Small deterministic name pools
        first_names = [
            "Juan",
            "María",
            "Sofía",
            "Mateo",
            "Valentina",
            "Santiago",
            "Isabella",
            "Samuel",
            "Daniela",
            "Emiliano",
            "Camila",
            "Nicolás",
            "Luciana",
            "Sebastián",
            "Gabriela",
            "David",
        ]
        last_names = [
            "García",
            "Rodríguez",
            "Martínez",
            "López",
            "González",
            "Pérez",
            "Sánchez",
            "Ramírez",
            "Torres",
            "Flores",
            "Rivera",
            "Gómez",
            "Díaz",
            "Vargas",
            "Castro",
            "Rojas",
        ]

        created_students = 0
        created_enrollments = 0

        # Avoid collisions if command is re-run without --reset
        existing_usernames = set(
            User.objects.filter(username__startswith=username_prefix).values_list(
                "username", flat=True
            )
        )
        existing_docs = set(
            Student.objects.filter(document_number__startswith="SEED-").values_list(
                "document_number", flat=True
            )
        )

        def iter_targets() -> Iterable[tuple[Group, int]]:
            for a in allocs:
                g = next(gr for gr in groups if gr.id == a.group_id)
                for i in range(a.count):
                    yield (g, i)

        with transaction.atomic():
            global_idx = 0
            for group, i_in_group in iter_targets():
                global_idx += 1

                username = f"{username_prefix}{group.id}_{i_in_group + 1}"
                if username in existing_usernames:
                    # find the next available suffix
                    bump = 2
                    while f"{username}_{bump}" in existing_usernames:
                        bump += 1
                    username = f"{username}_{bump}"

                first = first_names[(global_idx - 1) % len(first_names)]
                last = last_names[(global_idx - 1) % len(last_names)]

                email = f"{username}@example.com"

                doc = f"SEED-{group.academic_year.year}-{group.id}-{global_idx:04d}"
                if doc in existing_docs:
                    bump = 2
                    while f"{doc}-{bump}" in existing_docs:
                        bump += 1
                    doc = f"{doc}-{bump}"

                user = User(
                    username=username,
                    first_name=first,
                    last_name=last,
                    email=email,
                    role="STUDENT",
                    is_active=True,
                )
                user.set_password(password)
                user.save()

                student = Student.objects.create(
                    user=user,
                    document_type="TI",
                    document_number=doc,
                    nationality="Colombiana",
                )

                Enrollment.objects.create(
                    student=student,
                    academic_year=group.academic_year,
                    grade=group.grade,
                    group=group,
                    campus=group.campus,
                    status="ACTIVE",
                )

                existing_usernames.add(username)
                existing_docs.add(doc)

                created_students += 1
                created_enrollments += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created students: {created_students} | enrollments: {created_enrollments}."
            )
        )
