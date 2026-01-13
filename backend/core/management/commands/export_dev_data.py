from __future__ import annotations

import gzip
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command


DEFAULT_EXCLUDES = [
    # Ephemeral / noisy tables
    "admin.logentry",
    "sessions",
]


class Command(BaseCommand):
    help = (
        "Exporta data de la BD a un fixture (JSON .gz) para compartir entre desarrolladores. "
        "Opcionalmente empaqueta MEDIA_ROOT en un .zip."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default=None,
            help=(
                "Ruta del fixture de salida. Default: <BASE_DIR>/fixtures/dev-data.json.gz "
                "(BASE_DIR suele ser backend/)."
            ),
        )
        parser.add_argument(
            "--include-media",
            action="store_true",
            help="Incluye MEDIA_ROOT en un .zip aparte (no embebe en JSON).",
        )
        parser.add_argument(
            "--media-output",
            default=None,
            help="Ruta del zip de media. Default: <BASE_DIR>/fixtures/dev-media.zip",
        )
        parser.add_argument(
            "--include-system",
            action="store_true",
            help=(
                "Incluye tablas del sistema que normalmente no aportan en dev (p.ej. contenttypes). "
                "Por default se excluyen solo sessions y admin.logentry."
            ),
        )
        parser.add_argument(
            "--exclude",
            action="append",
            default=[],
            help=(
                "Etiqueta a excluir (puedes repetir). Ej: --exclude contenttypes --exclude auth.permission "
                "o modelos: --exclude admin.logentry"
            ),
        )
        parser.add_argument(
            "--indent",
            type=int,
            default=2,
            help="Indentación JSON (default: 2).",
        )
        parser.add_argument(
            "--database",
            default="default",
            help="Alias de BD a exportar (default: default).",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help=(
                "Confirma que entiendes que el fixture puede contener PII (estudiantes/usuarios) "
                "y que lo vas a compartir de forma segura."
            ),
        )

    def handle(self, *args, **options):
        if not options["yes"]:
            raise CommandError(
                "Operación sensible: este export puede incluir PII (estudiantes/usuarios). "
                "Re-ejecuta con --yes para confirmar."
            )

        base_dir = Path(getattr(settings, "BASE_DIR", Path.cwd())).resolve()
        fixtures_dir = base_dir / "fixtures"
        fixtures_dir.mkdir(parents=True, exist_ok=True)

        output_path = Path(options["output"] or (fixtures_dir / "dev-data.json.gz")).resolve()
        media_output_path = Path(
            options["media_output"] or (fixtures_dir / "dev-media.zip")
        ).resolve()

        excludes: list[str] = []
        if not options["include_system"]:
            excludes.extend(DEFAULT_EXCLUDES)
        excludes.extend(options["exclude"] or [])

        self.stdout.write(
            f"Exportando fixture a: {output_path} (database={options['database']})"
        )

        with gzip.open(output_path, mode="wt", encoding="utf-8") as gz:
            call_command(
                "dumpdata",
                stdout=gz,
                indent=options["indent"],
                database=options["database"],
                exclude=excludes,
            )

        self.stdout.write(self.style.SUCCESS(f"Fixture generado: {output_path}"))

        if options["include_media"]:
            media_root = getattr(settings, "MEDIA_ROOT", None)
            if not media_root:
                raise CommandError("MEDIA_ROOT no está configurado; no se puede exportar media.")

            media_root_path = Path(media_root).resolve()
            if not media_root_path.exists():
                self.stdout.write(
                    self.style.WARNING(
                        f"MEDIA_ROOT no existe ({media_root_path}); se genera zip vacío."
                    )
                )

            self.stdout.write(f"Empaquetando media a: {media_output_path}")
            with zipfile.ZipFile(media_output_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                if media_root_path.exists():
                    for path in media_root_path.rglob("*"):
                        if path.is_file():
                            arcname = path.relative_to(media_root_path)
                            zf.write(path, arcname.as_posix())

            self.stdout.write(self.style.SUCCESS(f"Media zip generado: {media_output_path}"))
