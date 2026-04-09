from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from academic.models import Period
from academic.period_closure import close_period, get_period_close_blocker


class Command(BaseCommand):
    help = "Cierra automaticamente periodos vencidos por grades_edit_until."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Solo muestra que periodos cerraria, sin modificar datos.",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options["dry_run"])
        now = timezone.now()

        qs = Period.objects.select_related("academic_year").filter(
            is_closed=False,
            grades_edit_until__isnull=False,
            grades_edit_until__lte=now,
        ).order_by("grades_edit_until", "id")

        total = qs.count()
        if total == 0:
            self.stdout.write("No hay periodos vencidos por cerrar.")
            return

        if dry_run:
            self.stdout.write(f"[dry-run] Periodos candidatos a cierre: {total}")
            for period in qs:
                blocker = get_period_close_blocker(period)
                suffix = f" | bloqueado: {blocker['detail']}" if blocker else ""
                self.stdout.write(
                    f"- {period.id} {period.name} ({getattr(period.academic_year, 'year', 'sin año')}) hasta {period.grades_edit_until.isoformat()}{suffix}"
                )
            return

        closed_count = 0
        skipped_count = 0
        for period in qs:
            blocker = get_period_close_blocker(period)
            if blocker is not None:
                skipped_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"Omitido periodo {period.id} {period.name}: {blocker['detail']}"
                    )
                )
                continue

            if close_period(period):
                closed_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Periodos cerrados automaticamente: {closed_count}. Omitidos: {skipped_count}."
            )
        )