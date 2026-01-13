from __future__ import annotations

import hashlib
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command


class Command(BaseCommand):
    help = (
        "Genera un bundle único (.zip) con el fixture dev-data.json.gz y, opcionalmente, dev-media.zip. "
        "Incluye un archivo .sha256 para verificación."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default=None,
            help=(
                "Ruta del .zip de salida. Default: <BASE_DIR>/fixtures/kampus-dev-bundle-<timestamp>.zip"
            ),
        )
        parser.add_argument(
            "--include-media",
            action="store_true",
            help="Incluye también un dev-media.zip (MEDIA_ROOT) dentro del bundle.",
        )
        parser.add_argument(
            "--database",
            default="default",
            help="Alias de BD a exportar (default: default).",
        )
        parser.add_argument(
            "--indent",
            type=int,
            default=2,
            help="Indentación JSON del fixture (default: 2).",
        )
        parser.add_argument(
            "--exclude",
            action="append",
            default=[],
            help="Etiqueta a excluir (puedes repetir).",
        )
        parser.add_argument(
            "--include-system",
            action="store_true",
            help="Pasa --include-system a export_dev_data.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help=(
                "Confirma que entiendes que el bundle puede contener PII (estudiantes/usuarios) "
                "y que lo vas a compartir de forma segura."
            ),
        )

    def handle(self, *args, **options):
        if not options["yes"]:
            raise CommandError(
                "Operación sensible: este bundle puede incluir PII (estudiantes/usuarios). "
                "Re-ejecuta con --yes para confirmar."
            )

        base_dir = Path(getattr(settings, "BASE_DIR", Path.cwd())).resolve()
        fixtures_dir = (base_dir / "fixtures").resolve()
        fixtures_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_zip = Path(options["output"] or (fixtures_dir / f"kampus-dev-bundle-{timestamp}.zip")).resolve()
        output_sha = output_zip.with_suffix(output_zip.suffix + ".sha256")

        tmp_dir = fixtures_dir / f".tmp_bundle_{timestamp}"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        try:
            fixture_path = tmp_dir / "dev-data.json.gz"
            media_zip_path = tmp_dir / "dev-media.zip"

            call_command(
                "export_dev_data",
                "--yes",
                "--output",
                str(fixture_path),
                "--database",
                options["database"],
                "--indent",
                str(options["indent"]),
                *( ["--include-system"] if options["include_system"] else [] ),
                *(sum((["--exclude", ex] for ex in (options["exclude"] or [])), [])),
                *( ["--include-media", "--media-output", str(media_zip_path)] if options["include_media"] else [] ),
            )

            if not fixture_path.exists():
                raise CommandError("No se generó el fixture esperado en el bundle.")

            self.stdout.write(f"Creando bundle: {output_zip}")
            with zipfile.ZipFile(output_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(fixture_path, "dev-data.json.gz")
                if options["include_media"] and media_zip_path.exists():
                    zf.write(media_zip_path, "dev-media.zip")

            sha256 = hashlib.sha256()
            with open(output_zip, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    sha256.update(chunk)

            output_sha.write_text(f"{sha256.hexdigest()}  {output_zip.name}\n", encoding="utf-8")

            self.stdout.write(self.style.SUCCESS(f"Bundle generado: {output_zip}"))
            self.stdout.write(self.style.SUCCESS(f"Checksum generado: {output_sha}"))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
