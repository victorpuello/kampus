from __future__ import annotations

import secrets
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import models
from django.db import transaction
from django.db.models import Q

from elections.models import ElectionCensusMember, VoteRecord, VoterToken


class Command(BaseCommand):
    help = (
        "Normaliza codigos manuales permanentes por estudiante y corrige duplicados por jornada "
        "para conservar un unico codigo reutilizable entre procesos."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Aplica cambios en base de datos. Si no se indica, solo simula.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Limita el numero de estudiantes a procesar (0 = sin limite).",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        limit = max(0, int(options.get("limit") or 0))

        members_qs = ElectionCensusMember.objects.all().order_by("id")
        if limit > 0:
            members_qs = members_qs[:limit]

        stats = {
            "members_processed": 0,
            "members_with_tokens": 0,
            "members_permanent_code_set": 0,
            "tokens_updated_to_canonical": 0,
            "duplicate_tokens_revoked": 0,
            "process_groups_normalized": 0,
        }

        for member in members_qs.iterator():
            stats["members_processed"] += 1

            student_external_id = str(member.student_external_id or "").strip()
            document_number = str(member.document_number or "").strip()

            if not student_external_id and not document_number:
                continue

            token_filter = Q()
            if student_external_id:
                token_filter |= Q(metadata__student_external_id=student_external_id)
            if document_number:
                token_filter |= Q(metadata__document_number=document_number)

            tokens = list(
                VoterToken.objects.filter(token_filter, metadata__manual_code__isnull=False)
                .select_related("process")
                .order_by("process_id", "-created_at", "-id")
            )
            if not tokens:
                continue

            stats["members_with_tokens"] += 1

            member_metadata = member.metadata if isinstance(member.metadata, dict) else {}
            canonical_code = str(member_metadata.get("permanent_manual_code") or "").strip()
            if not canonical_code:
                oldest_with_code = (
                    VoterToken.objects.filter(token_filter, metadata__manual_code__isnull=False)
                    .order_by("created_at", "id")
                    .first()
                )
                if oldest_with_code is not None:
                    token_metadata = oldest_with_code.metadata if isinstance(oldest_with_code.metadata, dict) else {}
                    canonical_code = str(token_metadata.get("manual_code") or "").strip()

            if not canonical_code:
                canonical_code = f"VOTO-{secrets.token_hex(5).upper()}"

            if str(member_metadata.get("permanent_manual_code") or "").strip() != canonical_code:
                member_metadata["permanent_manual_code"] = canonical_code
                if apply_changes:
                    member.metadata = member_metadata
                    member.save(update_fields=["metadata", "updated_at"])
                stats["members_permanent_code_set"] += 1

            canonical_hash = VoterToken.hash_token(canonical_code)
            vote_counts = {
                row["voter_token_id"]: row["count"]
                for row in VoteRecord.objects.filter(voter_token_id__in=[token.id for token in tokens])
                .values("voter_token_id")
                .annotate(count=models.Count("id"))
            }

            tokens_by_process: dict[int, list[VoterToken]] = defaultdict(list)
            for token in tokens:
                tokens_by_process[int(token.process_id)].append(token)

            for _, process_tokens in tokens_by_process.items():
                stats["process_groups_normalized"] += 1
                if len(process_tokens) == 1:
                    token = process_tokens[0]
                    token_metadata = token.metadata if isinstance(token.metadata, dict) else {}
                    if (
                        token.token_hash != canonical_hash
                        or str(token_metadata.get("manual_code") or "").strip() != canonical_code
                    ):
                        if apply_changes:
                            token_metadata["manual_code"] = canonical_code
                            token.token_hash = canonical_hash
                            token.token_prefix = canonical_code[:12]
                            token.metadata = token_metadata
                            token.save(update_fields=["token_hash", "token_prefix", "metadata"])
                        stats["tokens_updated_to_canonical"] += 1
                    continue

                def token_priority(item: VoterToken) -> tuple[int, int, float, int]:
                    votes = int(vote_counts.get(item.id, 0))
                    is_active = 1 if item.status == VoterToken.Status.ACTIVE else 0
                    created_ts = item.created_at.timestamp() if item.created_at else 0.0
                    return (1 if votes > 0 else 0, is_active, created_ts, item.id)

                keeper = sorted(process_tokens, key=token_priority, reverse=True)[0]

                same_hash_token = next((item for item in process_tokens if item.token_hash == canonical_hash), None)
                if same_hash_token is not None:
                    keeper = same_hash_token

                if keeper.token_hash != canonical_hash:
                    conflicting = (
                        VoterToken.objects.filter(process_id=keeper.process_id, token_hash=canonical_hash)
                        .exclude(id=keeper.id)
                        .first()
                    )
                    if conflicting is not None:
                        keeper = conflicting
                    else:
                        if apply_changes:
                            keeper_metadata = keeper.metadata if isinstance(keeper.metadata, dict) else {}
                            keeper_metadata["manual_code"] = canonical_code
                            keeper.token_hash = canonical_hash
                            keeper.token_prefix = canonical_code[:12]
                            keeper.metadata = keeper_metadata
                            keeper.save(update_fields=["token_hash", "token_prefix", "metadata"])
                        stats["tokens_updated_to_canonical"] += 1

                for token in process_tokens:
                    if token.id == keeper.id:
                        continue

                    token_metadata = token.metadata if isinstance(token.metadata, dict) else {}
                    needs_metadata_sync = str(token_metadata.get("manual_code") or "").strip() != canonical_code
                    should_revoke_duplicate = token.status == VoterToken.Status.ACTIVE and int(vote_counts.get(token.id, 0)) == 0

                    if not needs_metadata_sync and not should_revoke_duplicate:
                        continue

                    if apply_changes:
                        if needs_metadata_sync:
                            token_metadata["manual_code"] = canonical_code
                            token.metadata = token_metadata

                        update_fields = []
                        if needs_metadata_sync:
                            update_fields.append("metadata")

                        if should_revoke_duplicate:
                            token.status = VoterToken.Status.REVOKED
                            token.revoked_reason = "Normalizacion de codigo permanente: token duplicado por jornada."
                            update_fields.extend(["status", "revoked_reason"])
                            stats["duplicate_tokens_revoked"] += 1

                        if update_fields:
                            token.save(update_fields=update_fields)
                    else:
                        if should_revoke_duplicate:
                            stats["duplicate_tokens_revoked"] += 1

        mode_label = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write(self.style.SUCCESS(f"Normalizacion finalizada ({mode_label})."))
        for key, value in stats.items():
            self.stdout.write(f"- {key}: {value}")
