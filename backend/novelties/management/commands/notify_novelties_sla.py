from __future__ import annotations

from datetime import timedelta
import os

from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from notifications.services import notify_users
from students.models import Enrollment
from novelties.models import NoveltyCase
from users.models import User
from core.models import Institution, Campus


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, str(default)) or str(default)).strip()
    try:
        parsed = int(raw)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "true" if default else "false") or ("true" if default else "false")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _scope_ids(cases_qs):
    case_rows = list(cases_qs.values("institution_id", "student_id"))
    institution_ids = {row.get("institution_id") for row in case_rows if row.get("institution_id")}
    student_ids = {row.get("student_id") for row in case_rows if row.get("student_id")}

    campus_ids = set()
    group_ids = set()
    if student_ids:
        enrollments = Enrollment.objects.filter(student_id__in=student_ids).select_related("campus", "group")
        for enrollment in enrollments:
            if enrollment.campus_id:
                campus_ids.add(enrollment.campus_id)
            if enrollment.group_id:
                group_ids.add(enrollment.group_id)

    return institution_ids, campus_ids, group_ids


def _admin_recipients_for_cases(cases_qs):
    institution_ids, _, _ = _scope_ids(cases_qs)
    users_by_id = {}

    superadmins = User.objects.filter(role=User.ROLE_SUPERADMIN, is_active=True)
    for user in superadmins:
        users_by_id[user.id] = user

    if institution_ids:
        for institution in Institution.objects.filter(id__in=institution_ids).select_related("rector"):
            rector = getattr(institution, "rector", None)
            if rector and rector.is_active and rector.role in {User.ROLE_ADMIN, User.ROLE_SUPERADMIN}:
                users_by_id[rector.id] = rector

    return list(users_by_id.values())


def _coordinator_recipients_for_cases(cases_qs):
    _, campus_ids, group_ids = _scope_ids(cases_qs)
    users_by_id = {}

    if campus_ids:
        for campus in Campus.objects.filter(id__in=campus_ids).select_related("coordinator"):
            coordinator = getattr(campus, "coordinator", None)
            if coordinator and coordinator.is_active and coordinator.role == User.ROLE_COORDINATOR:
                users_by_id[coordinator.id] = coordinator

    if group_ids:
        group_directors = User.objects.filter(
            id__in=Enrollment.objects.filter(group_id__in=group_ids)
            .exclude(group__director_id__isnull=True)
            .values_list("group__director_id", flat=True),
            role=User.ROLE_TEACHER,
            is_active=True,
        )
        for user in group_directors:
            users_by_id[user.id] = user

    return list(users_by_id.values())


class Command(BaseCommand):
    help = "Notifica casos de novedades en revisión que superan el SLA."

    def handle(self, *args, **options):
        base_days = _env_int("KAMPUS_NOVELTIES_SLA_DAYS", 3)
        teacher_days = _env_int("KAMPUS_NOVELTIES_SLA_TEACHER_DAYS", base_days)
        admin_days = _env_int("KAMPUS_NOVELTIES_SLA_ESCALATE_ADMIN_DAYS", base_days)
        coordinator_days = _env_int("KAMPUS_NOVELTIES_SLA_ESCALATE_COORDINATOR_DAYS", 5)
        dedupe_within_seconds = _env_int("KAMPUS_NOVELTIES_SLA_DEDUPE_WITHIN_SECONDS", 90000)

        notify_teachers = _env_bool("KAMPUS_NOVELTIES_SLA_NOTIFY_TEACHERS_ENABLED", True)
        notify_admins = _env_bool("KAMPUS_NOVELTIES_SLA_NOTIFY_ADMINS_ENABLED", True)
        notify_coordinators = _env_bool("KAMPUS_NOVELTIES_SLA_NOTIFY_COORDINATORS_ENABLED", True)

        now = timezone.now()
        today_token = now.date().isoformat()

        teacher_since = now - timedelta(days=teacher_days)
        admin_since = now - timedelta(days=admin_days)
        coordinator_since = now - timedelta(days=coordinator_days)

        teacher_overdue = NoveltyCase.objects.filter(
            status=NoveltyCase.Status.IN_REVIEW,
            updated_at__lte=teacher_since,
            created_by__isnull=False,
            created_by__role=User.ROLE_TEACHER,
            created_by__is_active=True,
        )
        admin_overdue = NoveltyCase.objects.filter(
            status=NoveltyCase.Status.IN_REVIEW,
            updated_at__lte=admin_since,
        )
        coordinator_overdue = NoveltyCase.objects.filter(
            status=NoveltyCase.Status.IN_REVIEW,
            updated_at__lte=coordinator_since,
        )

        teacher_case_count = teacher_overdue.count()
        admin_case_count = admin_overdue.count()
        coordinator_case_count = coordinator_overdue.count()

        if teacher_case_count == 0 and admin_case_count == 0 and coordinator_case_count == 0:
            self.stdout.write("No hay casos vencidos")
            return

        teacher_notifications = 0
        admin_notifications = 0
        coordinator_notifications = 0

        if notify_teachers and teacher_case_count > 0:
            grouped = list(
                teacher_overdue.values("created_by_id").annotate(total=Count("id")).order_by("created_by_id")
            )
            teacher_ids = [row["created_by_id"] for row in grouped if row.get("created_by_id")]
            teachers_by_id = {
                user.id: user
                for user in User.objects.filter(
                    id__in=teacher_ids,
                    role=User.ROLE_TEACHER,
                    is_active=True,
                )
            }

            for row in grouped:
                teacher_id = row.get("created_by_id")
                total = int(row.get("total") or 0)
                teacher = teachers_by_id.get(teacher_id)
                if teacher is None or total <= 0:
                    continue

                created = notify_users(
                    recipients=[teacher],
                    title=f"Pendientes por revisar: {total} novedades",
                    body=(
                        f"Tienes {total} caso(s) en IN_REVIEW sin cambios desde hace {teacher_days}+ días. "
                        "Por favor revisa y actualiza su gestión."
                    ),
                    url="/novelties",
                    type="NOVELTY_SLA_TEACHER",
                    dedupe_key=f"novelties:sla:teacher:{teacher.id}:{teacher_days}:{today_token}",
                    dedupe_within_seconds=dedupe_within_seconds,
                )
                teacher_notifications += int(created or 0)

        if notify_admins and admin_case_count > 0:
            admin_recipients = _admin_recipients_for_cases(admin_overdue)
            admin_notifications = notify_users(
                recipients=admin_recipients,
                title=f"Escalamiento SLA: {admin_case_count} novedades en revisión",
                body=f"Hay {admin_case_count} casos en IN_REVIEW sin cambios desde hace {admin_days}+ días.",
                url="/novelties",
                type="NOVELTY_SLA_ADMIN",
                dedupe_key=f"novelties:sla:admin:{admin_days}:{today_token}",
                dedupe_within_seconds=dedupe_within_seconds,
            )

        if notify_coordinators and coordinator_case_count > 0:
            coordinator_recipients = _coordinator_recipients_for_cases(coordinator_overdue)
            coordinator_notifications = notify_users(
                recipients=coordinator_recipients,
                title=f"Escalamiento coordinación: {coordinator_case_count} novedades críticas",
                body=(
                    f"Hay {coordinator_case_count} casos en IN_REVIEW sin cambios desde hace "
                    f"{coordinator_days}+ días."
                ),
                url="/novelties",
                type="NOVELTY_SLA_COORDINATOR",
                dedupe_key=f"novelties:sla:coordinator:{coordinator_days}:{today_token}",
                dedupe_within_seconds=dedupe_within_seconds,
            )

        self.stdout.write(
            "Notificaciones enviadas "
            f"(docentes={teacher_notifications}, admins={admin_notifications}, coordinadores={coordinator_notifications})"
        )
