from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from students.models import Student


class Command(BaseCommand):
    help = (
        "Deactivates user accounts for students that already have GRADUATED enrollments "
        "and have no ACTIVE enrollments (historical data cleanup)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually update users (default is dry-run)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max users to deactivate in a single run (default: no limit)",
        )
        parser.add_argument(
            "--include-staff",
            action="store_true",
            help="Also consider staff/superusers (default: excluded)",
        )
        parser.add_argument(
            "--any-role",
            action="store_true",
            help="Do not restrict to role=STUDENT (default: only STUDENT)",
        )
        parser.add_argument(
            "--print",
            type=int,
            default=20,
            help="Print up to N matching usernames (default: 20; 0 disables)",
        )

    def handle(self, *args, **options):
        apply_changes: bool = options["apply"]
        limit: int | None = options["limit"]
        include_staff: bool = options["include_staff"]
        any_role: bool = options["any_role"]
        print_n: int = options["print"]

        User = get_user_model()
        student_role = getattr(User, "ROLE_STUDENT", "STUDENT")

        students_qs = (
            Student.objects.filter(user__is_active=True)
            .filter(enrollment__status="GRADUATED")
            .exclude(enrollment__status="ACTIVE")
            .distinct()
        )

        user_ids_qs = students_qs.values_list("user_id", flat=True)
        users_qs = User.objects.filter(is_active=True, pk__in=user_ids_qs).order_by("id")

        if not include_staff:
            users_qs = users_qs.filter(is_staff=False, is_superuser=False)

        if not any_role:
            users_qs = users_qs.filter(role=student_role)

        if limit is not None:
            users_qs = users_qs[: max(0, limit)]

        total = users_qs.count()
        mode = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write(self.style.MIGRATE_HEADING(f"normalize_graduated_users ({mode})"))
        self.stdout.write(f"Matches: {total}")

        if print_n and total:
            sample = list(users_qs.values_list("username", flat=True)[: max(0, print_n)])
            if sample:
                self.stdout.write("Sample usernames:")
                for username in sample:
                    self.stdout.write(f"- {username}")

        if not apply_changes:
            self.stdout.write("Dry-run: no changes applied. Use --apply to update.")
            return

        if total == 0:
            self.stdout.write("Nothing to do.")
            return

        with transaction.atomic():
            updated = users_qs.update(is_active=False)

        self.stdout.write(self.style.SUCCESS(f"Deactivated users: {updated}"))
