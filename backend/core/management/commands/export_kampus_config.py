from __future__ import annotations

from django.core.management.base import BaseCommand

from core.utils.config_transfer import export_config, write_json


class Command(BaseCommand):
    help = "Exporta la configuración institucional/académica a un archivo JSON."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default="kampus_config.json",
            help="Ruta del archivo JSON de salida (default: kampus_config.json)",
        )
        parser.add_argument(
            "--include-media",
            action="store_true",
            help="Incluye archivos (p.ej. logo institucional) embebidos como base64.",
        )

    def handle(self, *args, **options):
        output: str = options["output"]
        include_media: bool = options["include_media"]

        payload = export_config(include_media=include_media)
        write_json(output, payload)

        self.stdout.write(self.style.SUCCESS(f"Config exportada a {output}"))
