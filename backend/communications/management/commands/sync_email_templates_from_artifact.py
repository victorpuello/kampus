from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from communications.code_managed_templates import reset_code_managed_template_cache
from communications.models import EmailTemplate


REQUIRED_TEMPLATE_FIELDS = {
    "slug",
    "name",
    "description",
    "templateType",
    "category",
    "allowedVariables",
    "subjectTemplate",
    "bodyTextTemplate",
    "bodyHtmlTemplate",
}


def _default_artifact_path() -> Path:
    from communications.code_managed_templates import _artifact_path

    return _artifact_path()


def _normalize_template_type(value: str) -> str:
    text = str(value or "").strip().lower()
    if text == EmailTemplate.TYPE_MARKETING:
        return EmailTemplate.TYPE_MARKETING
    return EmailTemplate.TYPE_TRANSACTIONAL


def _load_artifact(path: Path) -> list[dict]:
    if not path.exists():
        raise CommandError(f"No existe artefacto de plantillas: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CommandError(f"Artefacto JSON invalido ({path}): {exc}") from exc

    templates = payload.get("templates")
    if not isinstance(templates, list):
        raise CommandError("El artefacto debe incluir la clave 'templates' como lista.")

    for index, row in enumerate(templates):
        if not isinstance(row, dict):
            raise CommandError(f"Template en indice {index} no es un objeto JSON.")
        missing = REQUIRED_TEMPLATE_FIELDS - set(row.keys())
        if missing:
            missing_str = ", ".join(sorted(missing))
            raise CommandError(
                f"Template '{row.get('slug', f'index-{index}')}' no contiene campos requeridos: {missing_str}"
            )

    slugs = [str(row.get("slug", "")).strip() for row in templates]
    if any(not slug for slug in slugs):
        raise CommandError("Todos los templates deben tener 'slug' no vacio.")
    if len(slugs) != len(set(slugs)):
        raise CommandError("El artefacto contiene slugs duplicados.")

    return templates


def sync_email_templates_from_artifact(
    *,
    artifact_path: Path,
    dry_run: bool,
    deactivate_missing: bool,
) -> dict[str, int | str | bool]:
    templates = _load_artifact(artifact_path)
    artifact_slugs = {str(row["slug"]).strip() for row in templates}

    created = 0
    updated = 0
    unchanged = 0
    deactivated = 0

    with transaction.atomic():
        for row in templates:
            slug = str(row["slug"]).strip()
            defaults = {
                "name": str(row["name"]).strip(),
                "description": str(row["description"]).strip(),
                "template_type": _normalize_template_type(row["templateType"]),
                "category": str(row["category"]).strip() or "transactional",
                "subject_template": str(row["subjectTemplate"]),
                "body_text_template": str(row["bodyTextTemplate"]),
                "body_html_template": str(row["bodyHtmlTemplate"]),
                "allowed_variables": list(row.get("allowedVariables") or []),
            }

            obj = EmailTemplate.objects.filter(slug=slug).first()
            if obj is None:
                EmailTemplate.objects.create(slug=slug, is_active=True, **defaults)
                created += 1
                continue

            has_changes = False
            for field, value in defaults.items():
                if getattr(obj, field) != value:
                    setattr(obj, field, value)
                    has_changes = True

            if not obj.is_active:
                obj.is_active = True
                has_changes = True

            if has_changes:
                obj.save()
                updated += 1
            else:
                unchanged += 1

        if deactivate_missing:
            deactivated = (
                EmailTemplate.objects.exclude(slug__in=artifact_slugs)
                .filter(is_active=True)
                .update(is_active=False)
            )

        if dry_run:
            transaction.set_rollback(True)

    reset_code_managed_template_cache()

    return {
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "deactivated": int(deactivated if deactivate_missing else 0),
        "templates_count": len(templates),
        "dry_run": dry_run,
        "deactivate_missing": deactivate_missing,
        "artifact_path": str(artifact_path),
    }


class Command(BaseCommand):
    help = "Sincroniza EmailTemplate en BD usando el artefacto precompilado de React Email."

    def add_arguments(self, parser):
        parser.add_argument(
            "--artifact",
            default="",
            help="Ruta al templates.json generado por React Email.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Muestra cambios sin escribir en base de datos.",
        )
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Desactiva slugs existentes en BD que no aparezcan en el artefacto.",
        )

    def handle(self, *args, **options):
        artifact_raw = str(options.get("artifact") or "").strip()
        artifact_path = Path(artifact_raw) if artifact_raw else _default_artifact_path()
        dry_run = bool(options.get("dry_run"))
        deactivate_missing = bool(options.get("deactivate_missing"))
        summary = sync_email_templates_from_artifact(
            artifact_path=artifact_path,
            dry_run=dry_run,
            deactivate_missing=deactivate_missing,
        )

        style = self.style.WARNING if dry_run else self.style.SUCCESS
        prefix = "[DRY-RUN] " if dry_run else ""

        self.stdout.write(
            style(
                f"{prefix}Sincronizacion completada: "
                f"created={summary['created']}, updated={summary['updated']}, unchanged={summary['unchanged']}, "
                f"deactivated={summary['deactivated']}"
            )
        )

        if deactivate_missing:
            self.stdout.write(self.style.WARNING("Modo deactivate-missing activado."))
