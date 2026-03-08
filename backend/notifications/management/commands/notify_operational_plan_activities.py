from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.models import NotificationType, OperationalPlanActivity
from notifications.services import notify_users


class Command(BaseCommand):
    help = "Envía recordatorios del plan operativo a docentes (7, 3 y 1 días antes)."

    def handle(self, *args, **options):
        today = timezone.localdate()
        reminder_offsets = [7, 3, 1]
        user_model = get_user_model()

        notification_type, _ = NotificationType.objects.get_or_create(code="OPERATIONAL_PLAN_REMINDER")
        changed_fields: list[str] = []
        if not notification_type.description:
            notification_type.description = "Recordatorio de actividad del plan operativo"
            changed_fields.append("description")
        if not notification_type.is_active:
            notification_type.is_active = True
            changed_fields.append("is_active")
        if changed_fields:
            notification_type.save(update_fields=changed_fields + ["updated_at"])

        recipients = list(
            user_model.objects.filter(
                role=user_model.ROLE_TEACHER,
                is_active=True,
            ).order_by("id")
        )

        if not recipients:
            self.stdout.write("No hay docentes activos para notificar.")
            return

        created_total = 0
        scanned_activities = 0

        for offset in reminder_offsets:
            target_date = today + timedelta(days=offset)
            activities = list(
                OperationalPlanActivity.objects.filter(
                    is_active=True,
                    activity_date=target_date,
                )
                .prefetch_related("responsible_users")
                .order_by("activity_date", "id")
            )

            for activity in activities:
                scanned_activities += 1
                responsible_names = [
                    (user.get_full_name() or user.username).strip()
                    for user in activity.responsible_users.all()
                ]
                responsible_text = ", ".join([name for name in responsible_names if name]) or "Sin responsable asignado"

                if activity.end_date and activity.end_date != activity.activity_date:
                    schedule_text = f"del {activity.activity_date:%d/%m/%Y} al {activity.end_date:%d/%m/%Y}"
                else:
                    schedule_text = f"el {activity.activity_date:%d/%m/%Y}"

                title = f"Actividad próxima: {activity.title}"
                body = (
                    f"La actividad '{activity.title}' está programada {schedule_text}. "
                    f"Faltan {offset} día(s). Responsables: {responsible_text}."
                )
                dedupe_key = f"operational-plan:{activity.id}:d{offset}"

                created = notify_users(
                    recipients=recipients,
                    title=title,
                    body=body,
                    url="/dashboard",
                    type="OPERATIONAL_PLAN_REMINDER",
                    dedupe_key=dedupe_key,
                    dedupe_within_seconds=93600,
                )
                created_total += int(created)

        self.stdout.write(
            f"operational plan reminders scanned_activities={scanned_activities} recipients={len(recipients)} created_notifications={created_total}"
        )
