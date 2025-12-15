from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from academic.models import (
    AcademicLevel,
    AcademicLoad,
    AcademicYear,
    AchievementDefinition,
    Area,
    Dimension,
    EvaluationComponent,
    EvaluationScale,
    Grade,
    Group,
    Period,
    Subject,
)
from core.models import Campus, Institution


SCHEMA_VERSION = 1


EXPORT_ORDER: list[tuple[str, Any]] = [
    ("institution", Institution),
    ("campuses", Campus),
    ("academic_years", AcademicYear),
    ("periods", Period),
    ("academic_levels", AcademicLevel),
    ("grades", Grade),
    ("groups", Group),
    ("areas", Area),
    ("subjects", Subject),
    ("academic_loads", AcademicLoad),
    ("evaluation_scales", EvaluationScale),
    ("dimensions", Dimension),
    ("evaluation_components", EvaluationComponent),
    ("achievement_definitions", AchievementDefinition),
]

DELETE_ORDER = [
    AchievementDefinition,
    EvaluationComponent,
    Dimension,
    EvaluationScale,
    AcademicLoad,
    Subject,
    Area,
    Group,
    Grade,
    AcademicLevel,
    Period,
    AcademicYear,
    Campus,
    Institution,
]


EXCLUDE_FIELDS: dict[Any, set[str]] = {
    Institution: {"rector", "secretary"},
    Campus: {"director", "campus_secretary", "coordinator"},
    Group: {"director"},
}


def _serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("utf-8")
    if isinstance(value, (list, dict)):
        return value
    return str(value)


def _model_to_export_dict(obj: Any, *, include_media: bool) -> dict[str, Any]:
    model = obj.__class__
    excluded = EXCLUDE_FIELDS.get(model, set())

    fields: dict[str, Any] = {}
    for field in obj._meta.fields:
        if field.name in excluded:
            continue
        if field.name == "id":
            continue

        value = getattr(obj, field.name)

        if field.is_relation:
            fields[field.name] = value.pk if value else None
            continue

        if field.get_internal_type() == "ImageField":
            if value and getattr(value, "name", ""):
                fields[field.name] = {
                    "name": value.name,
                    "content_b64": None,
                }
                if include_media:
                    try:
                        with value.open("rb") as f:
                            fields[field.name]["content_b64"] = base64.b64encode(f.read()).decode("utf-8")
                    except Exception:
                        # If file is missing, keep reference only.
                        pass
            else:
                fields[field.name] = None
            continue

        fields[field.name] = _serialize_value(value)

    return {"id": obj.pk, "fields": fields}


def export_config(*, include_media: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source": {
            "django_settings_module": getattr(settings, "SETTINGS_MODULE", None),
        },
        "data": {},
    }

    for key, model in EXPORT_ORDER:
        qs = model.objects.all().order_by("id")
        payload["data"][key] = [_model_to_export_dict(obj, include_media=include_media) for obj in qs]

    return payload


@dataclass
class ImportResult:
    created: dict[str, int]
    skipped: dict[str, int]


def _coerce_field_value(field, value: Any) -> Any:
    if value is None:
        return None

    internal = field.get_internal_type()
    if internal in {"DateField", "DateTimeField"}:
        # Django can parse ISO strings for Date/DateTime in many cases, but we normalize.
        if isinstance(value, str):
            if internal == "DateField":
                return date.fromisoformat(value)
            return datetime.fromisoformat(value.replace("Z", "+00:00"))

    if internal in {"DecimalField"} and isinstance(value, str):
        return Decimal(value)

    return value


def import_config(
    config: dict[str, Any],
    *,
    overwrite: bool = False,
    dry_run: bool = False,
    media_root: str | None = None,
) -> ImportResult:
    if config.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported schema_version: {config.get('schema_version')}")

    data = config.get("data")
    if not isinstance(data, dict):
        raise ValueError("Invalid config: missing 'data'")

    if overwrite and not dry_run:
        for model in DELETE_ORDER:
            model.objects.all().delete()

    id_maps: dict[Any, dict[int, int]] = {m: {} for _, m in EXPORT_ORDER}

    created: dict[str, int] = {}
    skipped: dict[str, int] = {}

    def get_new_id(model, old_id: int | None) -> int | None:
        if old_id is None:
            return None
        return id_maps[model].get(old_id)

    def save_image_field(field_name: str, image_spec: dict[str, Any]) -> ContentFile | None:
        name = image_spec.get("name")
        content_b64 = image_spec.get("content_b64")
        if not name:
            return None
        if not content_b64:
            return None
        raw = base64.b64decode(content_b64)
        # Keep relative path (including folders); storage will place it in MEDIA_ROOT.
        return ContentFile(raw, name=name)

    @transaction.atomic
    def _run_import() -> ImportResult:
        for key, model in EXPORT_ORDER:
            items = data.get(key, [])
            if not isinstance(items, list):
                raise ValueError(f"Invalid section '{key}': expected list")

            created_count = 0
            skipped_count = 0

            for item in items:
                if not isinstance(item, dict) or "id" not in item or "fields" not in item:
                    raise ValueError(f"Invalid item in '{key}'")

                old_id = int(item["id"])  # exported PK
                fields_in: dict[str, Any] = item["fields"] or {}

                excluded = EXCLUDE_FIELDS.get(model, set())
                model_fields = {f.name: f for f in model._meta.fields}

                create_kwargs: dict[str, Any] = {}
                for name, value in fields_in.items():
                    if name in excluded or name == "id":
                        continue
                    field = model_fields.get(name)
                    if not field:
                        continue

                    if field.is_relation:
                        rel_model = field.remote_field.model
                        # Map FK if it is one of our known models; otherwise null it.
                        if rel_model in id_maps:
                            create_kwargs[name + "_id"] = get_new_id(rel_model, value)
                        else:
                            create_kwargs[name + "_id"] = None
                        continue

                    if field.get_internal_type() == "ImageField":
                        if isinstance(value, dict):
                            if dry_run:
                                create_kwargs[name] = None
                            else:
                                file_obj = save_image_field(name, value)
                                if file_obj is not None:
                                    create_kwargs[name] = file_obj
                                else:
                                    create_kwargs[name] = None
                        else:
                            create_kwargs[name] = None
                        continue

                    create_kwargs[name] = _coerce_field_value(field, value)

                if dry_run:
                    # Simulate creation and mapping.
                    id_maps[model][old_id] = old_id
                    created_count += 1
                    continue

                obj = model.objects.create(**create_kwargs)
                id_maps[model][old_id] = obj.pk
                created_count += 1

            created[key] = created_count
            skipped[key] = skipped_count

        return ImportResult(created=created, skipped=skipped)

    if dry_run:
        # No DB writes.
        return _run_import()

    return _run_import()


def read_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
