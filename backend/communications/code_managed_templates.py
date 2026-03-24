from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from django.conf import settings


def _artifact_path() -> Path:
    configured = str(getattr(settings, "KAMPUS_EMAIL_TEMPLATES_ARTIFACT_PATH", "") or "").strip()
    if configured:
        return Path(configured)
    return Path(settings.BASE_DIR).parent / "kampus_frontend" / "email-templates" / "dist" / "templates.json"


@lru_cache(maxsize=1)
def get_code_managed_template_slugs() -> set[str]:
    path = _artifact_path()
    if not path.exists():
        return set()

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()

    templates = payload.get("templates")
    if not isinstance(templates, list):
        return set()

    slugs: set[str] = set()
    for row in templates:
        if not isinstance(row, dict):
            continue
        slug = str(row.get("slug") or "").strip()
        if slug:
            slugs.add(slug)

    return slugs


def is_code_managed_template_slug(slug: str) -> bool:
    return str(slug or "").strip() in get_code_managed_template_slugs()


def reset_code_managed_template_cache() -> None:
    get_code_managed_template_slugs.cache_clear()
