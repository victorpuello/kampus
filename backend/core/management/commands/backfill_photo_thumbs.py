from __future__ import annotations

import sys
from typing import Literal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Genera miniaturas WebP (256px) para fotos de estudiantes y docentes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--target",
            choices=["students", "teachers", "all"],
            default="all",
            help="Qué modelos procesar.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Regenera miniaturas incluso si ya existen.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Límite de registros a procesar (0 = sin límite).",
        )

    def handle(self, *args, **options):
        target: Literal["students", "teachers", "all"] = options["target"]
        force: bool = bool(options["force"])
        limit: int = int(options["limit"] or 0)

        processed = 0
        updated = 0
        skipped = 0
        skipped_missing = 0
        failed = 0

        def should_stop() -> bool:
            return bool(limit and processed >= limit)

        if target in ("students", "all"):
            from students.models import Student

            qs = Student.objects.all().only("user_id", "photo", "photo_thumb")
            for s in qs.iterator(chunk_size=200):
                if should_stop():
                    break
                processed += 1

                if not s.photo:
                    skipped += 1
                    continue
                if not s.photo.storage.exists(s.photo.name):
                    skipped_missing += 1
                    continue
                if (not force) and s.photo_thumb:
                    skipped += 1
                    continue

                try:
                    # Model.save() is responsible for generating/deleting thumbs.
                    s.photo_thumb = None if force else s.photo_thumb
                    s.save()
                    if s.photo_thumb:
                        updated += 1
                    else:
                        failed += 1
                except Exception as exc:
                    failed += 1
                    self.stderr.write(f"Student {s.user_id}: failed: {exc}")

        if (not should_stop()) and target in ("teachers", "all"):
            from teachers.models import Teacher

            qs = Teacher.objects.all().only("user_id", "photo", "photo_thumb")
            for t in qs.iterator(chunk_size=200):
                if should_stop():
                    break
                processed += 1

                if not t.photo:
                    skipped += 1
                    continue
                if not t.photo.storage.exists(t.photo.name):
                    skipped_missing += 1
                    continue
                if (not force) and t.photo_thumb:
                    skipped += 1
                    continue

                try:
                    t.photo_thumb = None if force else t.photo_thumb
                    t.save()
                    if t.photo_thumb:
                        updated += 1
                    else:
                        failed += 1
                except Exception as exc:
                    failed += 1
                    self.stderr.write(f"Teacher {t.user_id}: failed: {exc}")

        self.stdout.write(
            "Done. processed={processed} updated={updated} skipped={skipped} skipped_missing={skipped_missing} failed={failed}".format(
                processed=processed,
                updated=updated,
                skipped=skipped,
                skipped_missing=skipped_missing,
                failed=failed,
            )
        )

        if failed:
            # Non-zero exit code for CI/scripts.
            sys.exit(1)
