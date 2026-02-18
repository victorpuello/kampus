from __future__ import annotations

import csv
import secrets
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from elections.models import CandidatoContraloria, CandidatoPersoneria, ElectionProcess, ElectionRole, VoterToken


DEFAULT_ROLES = [
    {
        "code": "PERSONERO",
        "title": "Personero Estudiantil",
        "description": "Representa los intereses de los estudiantes y promueve la convivencia.",
        "candidates": [
            {
                "name": "Valentina Rojas",
                "number": "01",
                "grade": "11",
                "proposal": "Mediación escolar y espacios de escucha.",
            },
            {
                "name": "Julián Herrera",
                "number": "02",
                "grade": "Undécimo",
                "proposal": "Comités de bienestar estudiantil.",
            },
        ],
    },
    {
        "code": "CONTRALOR",
        "title": "Contralor Estudiantil",
        "description": "Promueve transparencia y seguimiento de recursos.",
        "candidates": [
            {
                "name": "María Camila Pérez",
                "number": "05",
                "grade": "10",
                "proposal": "Reportes trimestrales claros para estudiantes.",
            },
            {
                "name": "Daniel Quintero",
                "number": "06",
                "grade": "8",
                "proposal": "Mesa de veeduría con representantes por grado.",
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Crea una elección demo abierta con cargos, candidatos y tokens de votación de un solo uso."

    def add_arguments(self, parser):
        parser.add_argument(
            "--name",
            type=str,
            default=f"Elección Demo {timezone.localdate().isoformat()}",
            help="Nombre de la elección.",
        )
        parser.add_argument(
            "--tokens",
            type=int,
            default=25,
            help="Cantidad de tokens a generar.",
        )
        parser.add_argument(
            "--expires-hours",
            type=int,
            default=8,
            help="Horas de vigencia de los tokens.",
        )
        parser.add_argument(
            "--grade",
            type=str,
            default="",
            help="Grado asociado al token (opcional).",
        )
        parser.add_argument(
            "--shift",
            type=str,
            default="",
            help="Jornada asociada al token (opcional).",
        )
        parser.add_argument(
            "--output-csv",
            type=str,
            default="",
            help="Ruta CSV para exportar los tokens en texto plano.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        election_name = str(options["name"]).strip()
        token_count = max(1, int(options["tokens"]))
        expires_hours = max(1, int(options["expires_hours"]))
        student_grade = str(options["grade"] or "").strip()
        student_shift = str(options["shift"] or "").strip()
        output_csv = str(options["output_csv"] or "").strip()

        now = timezone.now()
        process = ElectionProcess.objects.create(
            name=election_name,
            status=ElectionProcess.Status.OPEN,
            starts_at=now,
            ends_at=now + timezone.timedelta(hours=expires_hours),
        )

        for role_index, role_data in enumerate(DEFAULT_ROLES, start=1):
            role = ElectionRole.objects.create(
                process=process,
                code=role_data["code"],
                title=role_data["title"],
                description=role_data["description"],
                display_order=role_index,
            )

            for candidate_index, candidate_data in enumerate(role_data["candidates"], start=1):
                candidate_payload = {
                    "role": role,
                    "name": candidate_data["name"],
                    "number": candidate_data["number"],
                    "grade": candidate_data["grade"],
                    "proposal": candidate_data["proposal"],
                    "display_order": candidate_index,
                    "is_active": True,
                }
                if role.code == ElectionRole.CODE_PERSONERO:
                    CandidatoPersoneria.objects.create(**candidate_payload)
                elif role.code == ElectionRole.CODE_CONTRALOR:
                    CandidatoContraloria.objects.create(**candidate_payload)

        token_rows: list[dict[str, str]] = []
        expires_at = now + timezone.timedelta(hours=expires_hours)

        for _ in range(token_count):
            raw_token = f"VOTO-{secrets.token_hex(5).upper()}"
            token_hash = VoterToken.hash_token(raw_token)

            VoterToken.objects.create(
                process=process,
                token_hash=token_hash,
                token_prefix=raw_token[:12],
                status=VoterToken.Status.ACTIVE,
                expires_at=expires_at,
                student_grade=student_grade,
                student_shift=student_shift,
                metadata={"seeded": True},
            )

            token_rows.append(
                {
                    "token": raw_token,
                    "token_prefix": raw_token[:12],
                    "process_id": str(process.id),
                    "grade": student_grade,
                    "shift": student_shift,
                    "expires_at": expires_at.isoformat(),
                }
            )

        if output_csv:
            csv_path = Path(output_csv)
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=list(token_rows[0].keys()))
                writer.writeheader()
                writer.writerows(token_rows)
            self.stdout.write(self.style.SUCCESS(f"Tokens exportados en: {csv_path}"))

        self.stdout.write(self.style.SUCCESS(f"Elección creada: id={process.id}, nombre='{process.name}'"))
        self.stdout.write(self.style.SUCCESS(f"Cargos creados: {len(DEFAULT_ROLES)} | Tokens creados: {token_count}"))
        self.stdout.write("Muestra de tokens:")
        for row in token_rows[: min(8, len(token_rows))]:
            self.stdout.write(f"- {row['token']}")
