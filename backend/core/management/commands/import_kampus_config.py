from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError

from core.utils.config_transfer import import_config, read_json


class Command(BaseCommand):
    help = "Importa la configuración institucional/académica desde un archivo JSON."

    def add_arguments(self, parser):
        parser.add_argument(
            "input",
            help="Ruta del archivo JSON a importar.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Valida y simula la importación (no escribe en la BD).",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Borra configuración existente antes de importar.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirma la operación cuando se usa --overwrite.",
        )

    def handle(self, *args, **options):
        input_path: str = options["input"]
        dry_run: bool = options["dry_run"]
        overwrite: bool = options["overwrite"]
        yes: bool = options["yes"]

        if overwrite and not yes:
            raise CommandError("Para usar --overwrite debes confirmar con --yes")

        payload = read_json(input_path)

        try:
            result = import_config(payload, overwrite=overwrite, dry_run=dry_run)
        except IntegrityError as e:
            raise CommandError(
                "Falló la importación por restricción de unicidad/integridad. "
                "Tip: si el sistema ya tiene datos, usa --overwrite --yes."
            ) from e
        except ValueError as e:
            raise CommandError(str(e)) from e

        summary = ", ".join(f"{k}={v}" for k, v in result.created.items())
        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry-run OK. Crearíamos: {summary}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Importación OK. Creados: {summary}"))
