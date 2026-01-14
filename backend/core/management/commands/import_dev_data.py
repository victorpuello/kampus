from __future__ import annotations

import gzip
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command


def _fixture_contains_model(input_path: Path, model_label: str) -> bool:
    needle = f'"model": "{model_label}"'
    if input_path.suffix == ".gz":
        opener = lambda: gzip.open(input_path, mode="rt", encoding="utf-8", errors="ignore")
    else:
        opener = lambda: input_path.open(mode="rt", encoding="utf-8", errors="ignore")

    with opener() as fp:
        for chunk in fp:
            if needle in chunk:
                return True
    return False


class Command(BaseCommand):
    help = (
        "Importa un fixture (JSON/.json.gz) generado por export_dev_data. "
        "Opcionalmente restaura MEDIA_ROOT desde un .zip."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "input",
            nargs="?",
            default=None,
            help="Ruta del fixture a importar. Default: <BASE_DIR>/fixtures/dev-data.json.gz",
        )
        parser.add_argument(
            "--media-zip",
            default=None,
            help="Ruta del zip de media a restaurar (opcional).",
        )
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Borra data existente antes de importar (requiere --yes).",
        )
        parser.add_argument(
            "--database",
            default="default",
            help="Alias de BD a importar (default: default).",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Confirma operaciones destructivas (p.ej. --flush).",
        )

    def handle(self, *args, **options):
        base_dir = Path(getattr(settings, "BASE_DIR", Path.cwd())).resolve()
        fixtures_dir = base_dir / "fixtures"

        input_path = Path(options["input"] or (fixtures_dir / "dev-data.json.gz")).resolve()
        if not input_path.exists():
            raise CommandError(f"No existe el fixture: {input_path}")

        if options["flush"] and not options["yes"]:
            raise CommandError("Para usar --flush debes confirmar con --yes")

        if options["flush"]:
            self.stdout.write(self.style.WARNING("Ejecutando flush (borrado total de data)..."))
            call_command(
                "flush",
                database=options["database"],
                interactive=False,
            )

            # Django recrea automáticamente contenttypes/permisos tras el flush.
            # Si el fixture también los contiene, loaddata puede fallar por duplicados.
            fixture_has_contenttypes = _fixture_contains_model(input_path, "contenttypes.contenttype")
            fixture_has_permissions = _fixture_contains_model(input_path, "auth.permission")

            if fixture_has_contenttypes or fixture_has_permissions:
                if fixture_has_contenttypes:
                    from django.contrib.contenttypes.models import ContentType

                    self.stdout.write(
                        self.style.WARNING(
                            "El fixture incluye contenttypes; limpiando ContentType antes de loaddata..."
                        )
                    )
                    ContentType.objects.all().delete()

                if fixture_has_permissions:
                    from django.contrib.auth.models import Permission

                    self.stdout.write(
                        self.style.WARNING(
                            "El fixture incluye permisos; limpiando Permission antes de loaddata..."
                        )
                    )
                    Permission.objects.all().delete()

        self.stdout.write(f"Importando fixture: {input_path} (database={options['database']})")
        call_command(
            "loaddata",
            str(input_path),
            database=options["database"],
        )
        self.stdout.write(self.style.SUCCESS("Importación de fixture completada."))

        media_zip = options["media_zip"]
        if media_zip:
            media_root = getattr(settings, "MEDIA_ROOT", None)
            if not media_root:
                raise CommandError("MEDIA_ROOT no está configurado; no se puede restaurar media.")

            media_root_path = Path(media_root).resolve()
            media_root_path.mkdir(parents=True, exist_ok=True)

            media_zip_path = Path(media_zip).resolve()
            if not media_zip_path.exists():
                raise CommandError(f"No existe el zip de media: {media_zip_path}")

            self.stdout.write(f"Restaurando media a: {media_root_path}")
            with zipfile.ZipFile(media_zip_path, mode="r") as zf:
                zf.extractall(media_root_path)

            self.stdout.write(self.style.SUCCESS("Restauración de media completada."))
