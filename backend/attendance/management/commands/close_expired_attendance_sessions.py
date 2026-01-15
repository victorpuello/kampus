from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from attendance.models import AttendanceSession


class Command(BaseCommand):
    help = "Cierra automáticamente clases de asistencia vencidas (por defecto: 1 hora)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=1,
            help="Horas después de starts_at para cerrar la clase (default: 1).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Solo muestra cuántas clases cerraría, sin modificar datos.",
        )

    def handle(self, *args, **options):
        hours: int = int(options["hours"])
        dry_run: bool = bool(options["dry_run"])

        if hours <= 0:
            self.stderr.write(self.style.ERROR("--hours debe ser > 0"))
            return

        now = timezone.now()
        deadline = now - timedelta(hours=hours)

        qs = AttendanceSession.objects.filter(locked_at__isnull=True, starts_at__lte=deadline)

        total = qs.count()
        if dry_run:
            self.stdout.write(f"[dry-run] Cerrarían {total} clases (starts_at <= {deadline.isoformat()}).")
            return

        if total == 0:
            self.stdout.write("No hay clases por cerrar.")
            return

        with transaction.atomic():
            updated = qs.update(locked_at=now)

        self.stdout.write(self.style.SUCCESS(f"Clases cerradas: {updated}"))
