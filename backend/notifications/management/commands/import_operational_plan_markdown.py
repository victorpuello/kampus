from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from notifications.models import OperationalPlanActivity


MONTHS_ES = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def _clean_cell(value: str) -> str:
    v = str(value or "").strip()
    v = re.sub(r"\*\*(.*?)\*\*", r"\1", v)
    v = v.replace("`", "").strip()
    v = re.sub(r"\s+", " ", v)
    return v


def _extract_first_date(value: str, fallback_year: int) -> date | None:
    text = _clean_cell(value).lower()
    match = re.search(
        r"(?P<day>\d{1,2})\s*(?:de)?\s*(?P<month>enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s*(?:de)?\s*(?P<year>\d{4}))?",
        text,
    )
    if not match:
        return None

    day = int(match.group("day"))
    month_name = str(match.group("month"))
    month = MONTHS_ES.get(month_name)
    if month is None:
        return None
    year = int(match.group("year")) if match.group("year") else int(fallback_year)

    try:
        return date(year, month, day)
    except ValueError:
        return None


def _extract_date_range(value: str, fallback_year: int) -> tuple[date | None, date | None]:
    start_date = _extract_first_date(value, fallback_year)
    if start_date is None:
        return None, None

    text = _clean_cell(value).lower()
    text = text.replace("–", "-").replace("—", "-")
    month_pattern = r"enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre"
    range_match = re.search(
        rf"(?:-|\bal\b|\ba\b)\s*(?P<day2>\d{{1,2}})\s*(?:de)?\s*(?P<month2>{month_pattern})?",
        text,
    )
    if not range_match:
        return start_date, None

    day2 = int(range_match.group("day2"))
    month2_name = range_match.group("month2")
    month2 = MONTHS_ES.get(month2_name) if month2_name else start_date.month
    if month2 is None:
        return start_date, None

    try:
        end_date = date(start_date.year, month2, day2)
    except ValueError:
        return start_date, None

    if end_date < start_date:
        return start_date, None
    if end_date == start_date:
        return start_date, None
    return start_date, end_date


class Command(BaseCommand):
    help = "Importa actividades del plan operativo desde un archivo Markdown con tabla FECHA | ACTIVIDADES | RESPONSABLES."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Ruta al archivo markdown")
        parser.add_argument("--year", type=int, default=2026, help="Año por defecto cuando la fila no trae año")
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Si se indica, elimina actividades existentes antes de importar.",
        )

    def handle(self, *args, **options):
        file_path = Path(str(options["file"]))
        default_year = int(options["year"])
        replace = bool(options["replace"])

        if not file_path.exists() or not file_path.is_file():
            raise CommandError(f"Archivo no encontrado: {file_path}")

        raw = file_path.read_text(encoding="utf-8")
        lines = raw.splitlines()

        if replace:
            deleted, _ = OperationalPlanActivity.objects.all().delete()
            self.stdout.write(f"Se eliminaron {deleted} registros previos del plan operativo.")

        imported = 0
        skipped = 0

        for line in lines:
            if "|" not in line:
                continue

            cells = [part.strip() for part in line.split("|")]
            if len(cells) < 4:
                continue

            fecha_raw = _clean_cell(cells[1])
            actividad_raw = _clean_cell(cells[2])
            responsables_raw = _clean_cell(cells[3])

            if not fecha_raw or not actividad_raw:
                continue

            header_like = fecha_raw.lower().startswith("fecha") or actividad_raw.lower().startswith("actividades")
            separator_like = re.fullmatch(r"[:\-\s]+", actividad_raw or "") is not None
            if header_like or separator_like:
                continue

            activity_date, end_date = _extract_date_range(fecha_raw, default_year)
            if activity_date is None:
                skipped += 1
                self.stdout.write(self.style.WARNING(f"Sin fecha interpretable, se omite fila: {fecha_raw} | {actividad_raw}"))
                continue

            description_parts = [f"Fecha original: {fecha_raw}"]
            if responsables_raw:
                description_parts.append(f"Responsables (texto): {responsables_raw}")

            OperationalPlanActivity.objects.create(
                title=actividad_raw,
                description="\n".join(description_parts),
                activity_date=activity_date,
                end_date=end_date,
                is_active=True,
            )
            imported += 1

        self.stdout.write(self.style.SUCCESS(f"Importación finalizada. imported={imported} skipped={skipped}"))
