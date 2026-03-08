from __future__ import annotations

import re
import unicodedata

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from notifications.models import OperationalPlanActivity


RESPONSIBLES_PREFIX = "Responsables (texto):"


def _normalize(value: str) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_responsables_text(description: str) -> str:
    for line in str(description or "").splitlines():
        if line.strip().startswith(RESPONSIBLES_PREFIX):
            return line.split(":", 1)[1].strip()
    return ""


def _split_tokens(raw: str) -> list[str]:
    text = str(raw or "").strip().lower()
    text = text.replace(" y ", ",")
    text = text.replace(";", ",")
    text = text.replace("/", ",")
    parts = [item.strip() for item in text.split(",")]

    normalized_parts: list[str] = []
    for item in parts:
        token = _normalize(item)
        token = re.sub(r"^(doc|docente|prof|profe)\s+", "", token)
        token = re.sub(r"\s+", " ", token).strip()
        if token:
            normalized_parts.append(token)

    return normalized_parts


class Command(BaseCommand):
    help = "Mapea responsables en texto del plan operativo a usuarios reales y los asigna a cada actividad."

    def add_arguments(self, parser):
        parser.add_argument(
            "--replace-existing",
            action="store_true",
            help="Reemplaza responsables existentes. Por defecto solo llena actividades sin responsables.",
        )

    def handle(self, *args, **options):
        replace_existing = bool(options["replace_existing"])

        user_model = get_user_model()
        active_users = list(user_model.objects.filter(is_active=True).order_by("id"))
        teacher_users = [u for u in active_users if u.role == user_model.ROLE_TEACHER]

        users_catalog: list[tuple[object, str, str, str, str]] = []
        for user in active_users:
            first = _normalize(getattr(user, "first_name", "") or "")
            last = _normalize(getattr(user, "last_name", "") or "")
            full = _normalize(f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}")
            username = _normalize(getattr(user, "username", "") or "")
            users_catalog.append((user, first, last, full, username))

        activities = OperationalPlanActivity.objects.prefetch_related("responsible_users").all()
        total = activities.count()
        assigned_count = 0
        unchanged_count = 0
        unresolved_tokens: dict[str, int] = {}

        for activity in activities:
            current_ids = set(activity.responsible_users.values_list("id", flat=True))
            if current_ids and not replace_existing:
                unchanged_count += 1
                continue

            raw = _extract_responsables_text(activity.description)
            tokens = _split_tokens(raw)
            selected_ids: set[int] = set()

            for token in tokens:
                # Reglas globales por texto funcional
                if token in {
                    "todos",
                    "todos los docentes",
                    "docentes",
                    "docentes por area",
                    "directores de grupo",
                    "docentes bachillerato",
                    "doc sociales",
                }:
                    selected_ids.update(u.id for u in teacher_users)
                    continue

                words = [w for w in token.split(" ") if len(w) >= 3]
                if not words:
                    unresolved_tokens[token] = unresolved_tokens.get(token, 0) + 1
                    continue

                matched_for_token: set[int] = set()
                for user, first, last, full, username in users_catalog:
                    if len(words) == 1:
                        w = words[0]
                        if w in first or w in last or w in full or w in username:
                            matched_for_token.add(user.id)
                    else:
                        if all(w in full for w in words):
                            matched_for_token.add(user.id)

                if not matched_for_token:
                    unresolved_tokens[token] = unresolved_tokens.get(token, 0) + 1
                    continue

                selected_ids.update(matched_for_token)

            if selected_ids:
                activity.responsible_users.set(sorted(selected_ids))
                assigned_count += 1
            else:
                unchanged_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Mapeo finalizado. total={total} actividades_actualizadas={assigned_count} sin_cambios={unchanged_count}"
            )
        )

        if unresolved_tokens:
            self.stdout.write(self.style.WARNING("Tokens sin resolver:"))
            for token, count in sorted(unresolved_tokens.items(), key=lambda item: (-item[1], item[0])):
                self.stdout.write(f"- {token}: {count}")
