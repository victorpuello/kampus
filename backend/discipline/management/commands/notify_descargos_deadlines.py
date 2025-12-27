from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.services import admin_like_users_qs, notify_users

from discipline.models import DisciplineCase, DisciplineCaseEvent


class Command(BaseCommand):
	help = (
		"Genera notificaciones in-app por plazos de descargos (por vencer o vencidos). "
		"Pensado para ejecutarse periódicamente (cron)."
	)

	def add_arguments(self, parser):
		parser.add_argument(
			"--hours-before",
			dest="hours_before",
			type=int,
			default=24,
			help="Ventana en horas para 'por vencer' (default: 24).",
		)
		parser.add_argument(
			"--dry-run",
			action="store_true",
			default=False,
			help="No crea notificaciones, solo muestra conteos.",
		)

	def handle(self, *args, **options):
		now = timezone.now()
		hours_before = int(options["hours_before"])
		dry_run = bool(options["dry_run"])

		cutoff = now + timedelta(hours=hours_before)
		descargos_case_ids = DisciplineCaseEvent.objects.filter(
			event_type=DisciplineCaseEvent.Type.DESCARGOS
		).values_list("case_id", flat=True)

		base_qs = DisciplineCase.objects.filter(
			status=DisciplineCase.Status.OPEN,
			descargos_due_at__isnull=False,
		).exclude(id__in=descargos_case_ids)

		due_soon_qs = base_qs.filter(descargos_due_at__gte=now, descargos_due_at__lte=cutoff)
		overdue_qs = base_qs.filter(descargos_due_at__lt=now)

		self.stdout.write(
			f"Descargos deadlines: due_soon={due_soon_qs.count()} overdue={overdue_qs.count()} (dry_run={dry_run})"
		)

		if dry_run:
			return

		admin_like = list(admin_like_users_qs())

		notified_due_soon = 0
		notified_overdue = 0

		for case in due_soon_qs.select_related("student", "created_by"):
			due_local = timezone.localtime(case.descargos_due_at) if case.descargos_due_at else None
			title = "Descargos por vencer"
			body = (
				f"Caso #{case.id} ({case.student}): plazo de descargos vence el {due_local:%Y-%m-%d %H:%M}."
				if due_local
				else f"Caso #{case.id} ({case.student}): plazo de descargos por vencer."
			)
			url = f"/discipline/cases/{case.id}"
			dedupe_key = f"discipline:case:{case.id}:descargos:due_soon:{case.descargos_due_at.isoformat()}"

			recipients = [u for u in [case.created_by] if u and u.is_active]
			recipients += [u for u in admin_like if u and u.is_active]
			recipients = list({u.id: u for u in recipients}.values())

			if not recipients:
				continue

			notified_due_soon += notify_users(
				recipients=recipients,
				title=title,
				body=body,
				url=url,
				type="DISCIPLINE_CASE",
				dedupe_key=dedupe_key,
				dedupe_within_seconds=6 * 3600,
			)

		for case in overdue_qs.select_related("student", "created_by"):
			due_local = timezone.localtime(case.descargos_due_at) if case.descargos_due_at else None
			title = "Descargos vencidos"
			body = (
				f"Caso #{case.id} ({case.student}): plazo de descargos venció el {due_local:%Y-%m-%d %H:%M}."
				if due_local
				else f"Caso #{case.id} ({case.student}): plazo de descargos vencido."
			)
			url = f"/discipline/cases/{case.id}"
			dedupe_key = f"discipline:case:{case.id}:descargos:overdue:{case.descargos_due_at.isoformat()}"

			recipients = [u for u in [case.created_by] if u and u.is_active]
			recipients += [u for u in admin_like if u and u.is_active]
			recipients = list({u.id: u for u in recipients}.values())

			if not recipients:
				continue

			notified_overdue += notify_users(
				recipients=recipients,
				title=title,
				body=body,
				url=url,
				type="DISCIPLINE_CASE",
				dedupe_key=dedupe_key,
				dedupe_within_seconds=24 * 3600,
			)

		self.stdout.write(
			f"Notificaciones creadas: due_soon={notified_due_soon} overdue={notified_overdue}"
		)
