from __future__ import annotations

import re
from typing import Optional

from django.core.management.base import BaseCommand

from academic.models import Grade


def _normalize(text: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


# Ordinal mapping (Jardín -> 11). We keep it name-based because each institution may have its own Grade rows.
# If a grade name doesn't match, we leave it untouched and report it.
_NAME_TO_ORDINAL = {
    # Preescolar
    "jardin": 1,
    "jardín": 1,
    "prejardin": 1,
    "pre-jardin": 1,
    "pre-jardín": 1,
    "pre jardín": 1,
    "transicion": 2,
    "transición": 2,
    "kinder": 2,
    "kínder": 2,
    # Básica primaria
    "primero": 3,
    "1": 3,
    "1°": 3,
    "segundo": 4,
    "2": 4,
    "2°": 4,
    "tercero": 5,
    "3": 5,
    "3°": 5,
    "cuarto": 6,
    "4": 6,
    "4°": 6,
    "quinto": 7,
    "5": 7,
    "5°": 7,
    # Básica secundaria
    "sexto": 8,
    "6": 8,
    "6°": 8,
    "septimo": 9,
    "séptimo": 9,
    "7": 9,
    "7°": 9,
    "octavo": 10,
    "8": 10,
    "8°": 10,
    "noveno": 11,
    "9": 11,
    "9°": 11,
    # Media
    "decimo": 12,
    "décimo": 12,
    "10": 12,
    "10°": 12,
    "undecimo": 13,
    "undécimo": 13,
    "11": 13,
    "11°": 13,
}


def guess_ordinal(grade_name: str) -> Optional[int]:
    name = _normalize(grade_name)
    if name in _NAME_TO_ORDINAL:
        return _NAME_TO_ORDINAL[name]

    # Common formats like "Grado 10" or "10o" or "10º"
    m = re.search(r"\b(\d{1,2})\b", name)
    if m:
        n = int(m.group(1))
        if n == 1:
            return 3
        if n == 2:
            return 4
        if n == 3:
            return 5
        if n == 4:
            return 6
        if n == 5:
            return 7
        if n == 6:
            return 8
        if n == 7:
            return 9
        if n == 8:
            return 10
        if n == 9:
            return 11
        if n == 10:
            return 12
        if n == 11:
            return 13

    return None


class Command(BaseCommand):
    help = "Populate Grade.ordinal for common Colombian grade names (Jardín → 11)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print what would change; do not write to the database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite ordinal even if already set.",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options["dry_run"])
        force: bool = bool(options["force"])

        updated = 0
        skipped = 0
        unknown = 0

        for grade in Grade.objects.all().order_by("id"):
            guessed = guess_ordinal(grade.name)
            if guessed is None:
                unknown += 1
                self.stdout.write(self.style.WARNING(f"[UNKNOWN] Grade(id={grade.id}) name='{grade.name}'"))
                continue

            if (grade.ordinal is not None) and not force:
                skipped += 1
                continue

            if not dry_run:
                grade.ordinal = guessed
                grade.save(update_fields=["ordinal"])

            updated += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"[SET] Grade(id={grade.id}) name='{grade.name}' -> ordinal={guessed}{' (dry-run)' if dry_run else ''}"
                )
            )

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Done. updated={updated}, skipped={skipped}, unknown={unknown}, dry_run={dry_run}, force={force}"
            )
        )
