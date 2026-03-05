from __future__ import annotations

import os
from datetime import date, datetime, time

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from academic.models import AcademicYear, Achievement, Period, TeacherAssignment
from notifications.services import notify_users
from reports.models import PeriodicJobRuntimeConfig
from users.models import User


def _env_int(name: str, default: int) -> int:
    raw = str(os.getenv(name, str(default)) or str(default)).strip()
    try:
        return int(raw)
    except (TypeError, ValueError):
        return int(default)


def _period_end_of_day(period: Period) -> datetime | None:
    if getattr(period, "end_date", None) is None:
        return None
    tz = timezone.get_current_timezone()
    dt = datetime.combine(period.end_date, time(23, 59, 59))
    return timezone.make_aware(dt, tz)


def _pick_current_period_for_year(year: AcademicYear) -> Period | None:
    periods = list(Period.objects.filter(academic_year=year).order_by("start_date", "id"))
    if not periods:
        return None

    today = date.today()
    for period in periods:
        if period.start_date and period.end_date and period.start_date <= today <= period.end_date:
            return period

    for period in periods:
        if not bool(period.is_closed):
            return period

    return periods[-1]


class Command(BaseCommand):
    help = "Notifica a docentes con planeacion faltante o incompleta en el periodo actual."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", default=False)
        parser.add_argument("--period-id", type=int, default=None)
        parser.add_argument("--only-teacher-id", type=int, default=None)

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        period_id = options.get("period_id")
        only_teacher_id = options.get("only_teacher_id")
        dedupe_within_seconds = _env_int("KAMPUS_PLANNING_REMINDER_DEDUPE_SECONDS", 86400)
        runtime_cfg = PeriodicJobRuntimeConfig.objects.filter(job_key="notify-pending-planning-teachers").first()
        if runtime_cfg and isinstance((runtime_cfg.params_override or {}).get("dedupe_within_seconds"), int):
            dedupe_within_seconds = int(runtime_cfg.params_override["dedupe_within_seconds"])

        year = (
            AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
            or AcademicYear.objects.order_by("-year").first()
        )
        if year is None:
            self.stdout.write("No hay años lectivos configurados")
            return

        if period_id is not None:
            period = Period.objects.filter(id=period_id, academic_year=year).first()
            if period is None:
                self.stdout.write("Periodo invalido para el año lectivo actual")
                return
        else:
            period = _pick_current_period_for_year(year)

        if period is None:
            self.stdout.write("No hay periodo actual para evaluar")
            return

        assignments_qs = TeacherAssignment.objects.filter(
            academic_year=year,
            teacher__role=User.ROLE_TEACHER,
            teacher__is_active=True,
            group_id__isnull=False,
            academic_load_id__isnull=False,
        )
        if only_teacher_id is not None:
            assignments_qs = assignments_qs.filter(teacher_id=int(only_teacher_id))

        assignment_rows = list(assignments_qs.values_list("teacher_id", "group_id", "academic_load_id").distinct())
        if not assignment_rows:
            self.stdout.write("No hay asignaciones docentes para evaluar")
            return

        teacher_pairs: dict[int, set[tuple[int, int]]] = {}
        all_pairs: set[tuple[int, int]] = set()
        for teacher_id, group_id, academic_load_id in assignment_rows:
            pair = (int(group_id), int(academic_load_id))
            teacher_pairs.setdefault(int(teacher_id), set()).add(pair)
            all_pairs.add(pair)

        achievements_q = Q()
        for group_id, academic_load_id in all_pairs:
            achievements_q |= Q(group_id=group_id, academic_load_id=academic_load_id)

        if achievements_q:
            planned_pairs = set(
                Achievement.objects.filter(period=period)
                .filter(achievements_q)
                .values_list("group_id", "academic_load_id")
                .distinct()
            )
        else:
            planned_pairs = set()

        teacher_ids = sorted(teacher_pairs.keys())
        teacher_map = {
            u.id: u
            for u in User.objects.filter(id__in=teacher_ids, role=User.ROLE_TEACHER, is_active=True)
        }

        closure_dt = timezone.localtime(period.planning_edit_until) if period.planning_edit_until else _period_end_of_day(period)
        closure_label = timezone.localtime(closure_dt).strftime("%Y-%m-%d %H:%M") if closure_dt else "sin fecha definida"

        today_token = timezone.localdate().isoformat()
        candidate_missing = 0
        candidate_incomplete = 0
        created_missing = 0
        created_incomplete = 0
        evaluated = 0

        for teacher_id in teacher_ids:
            teacher = teacher_map.get(teacher_id)
            if teacher is None:
                continue

            pairs = teacher_pairs.get(teacher_id, set())
            if not pairs:
                continue

            evaluated += 1
            total = len(pairs)
            with_planning = len(pairs & planned_pairs)
            missing = max(0, total - with_planning)
            completion_percent = int(round((with_planning / total) * 100)) if total > 0 else 0

            if with_planning == 0:
                candidate_missing += 1
                if not dry_run:
                    created_missing += notify_users(
                        recipients=[teacher],
                        title="Aun no has realizado la planeacion del periodo actual",
                        body=(
                            f"Tienes 0 de {total} asignaciones con planeacion registrada. "
                            f"La fecha de cierre es {closure_label}. "
                            "Por favor completa tu planeacion lo antes posible."
                        ),
                        url="/planning",
                        type="PLANNING_REMINDER_MISSING",
                        dedupe_key=(
                            f"planning:reminder:missing:teacher={teacher.id}:period={period.id}:date={today_token}"
                        ),
                        dedupe_within_seconds=dedupe_within_seconds,
                    )
                continue

            if completion_percent < 100:
                candidate_incomplete += 1
                if not dry_run:
                    created_incomplete += notify_users(
                        recipients=[teacher],
                        title="Tu planeacion del periodo actual esta incompleta",
                        body=(
                            f"Has completado {with_planning} de {total} asignaciones. "
                            f"Te faltan {missing}. La fecha de cierre es {closure_label}. "
                            "Ingresa y termina tu planeacion para evitar retrasos."
                        ),
                        url="/planning",
                        type="PLANNING_REMINDER_INCOMPLETE",
                        dedupe_key=(
                            f"planning:reminder:incomplete:teacher={teacher.id}:period={period.id}:date={today_token}"
                        ),
                        dedupe_within_seconds=dedupe_within_seconds,
                    )

        self.stdout.write(
            (
                f"Planning reminders period={period.id} dry_run={dry_run} "
                f"evaluated={evaluated} "
                f"missing_candidates={candidate_missing} incomplete_candidates={candidate_incomplete} "
                f"missing_created={created_missing} incomplete_created={created_incomplete}"
            )
        )
