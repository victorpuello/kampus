from __future__ import annotations

import secrets
import hashlib
from typing import Any

from django.db import models
from django.utils import timezone


class VerifiableDocument(models.Model):
    class DocType(models.TextChoices):
        STUDY_CERTIFICATE = "STUDY_CERTIFICATE", "Certificado de estudios"
        STUDY_CERTIFICATION = "STUDY_CERTIFICATION", "Certificación académica"
        REPORT_CARD = "REPORT_CARD", "Boletín / Informe académico"
        OBSERVER_REPORT = "OBSERVER_REPORT", "Observador del estudiante"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Activo"
        REVOKED = "REVOKED", "Revocado"
        EXPIRED = "EXPIRED", "Expirado"

    token = models.CharField(max_length=64, unique=True, db_index=True)
    doc_type = models.CharField(max_length=40, choices=DocType.choices, db_index=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)

    issued_at = models.DateTimeField(default=timezone.now, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)

    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    revoked_reason = models.CharField(max_length=255, blank=True, default="")

    seal_hash = models.CharField(max_length=128, blank=True, default="")

    # Optional reference to a concrete object (e.g., CertificateIssue UUID, ReportJob id)
    object_type = models.CharField(max_length=80, blank=True, default="")
    object_id = models.CharField(max_length=80, blank=True, default="")

    # Minimal snapshot for public display/verification (avoid exposing sensitive data)
    public_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["doc_type", "issued_at"]),
            models.Index(fields=["status", "issued_at"]),
        ]

    @staticmethod
    def generate_token() -> str:
        # ~32 chars base64url, safe for URLs.
        return secrets.token_urlsafe(24)

    @classmethod
    def create_with_unique_token(
        cls,
        *,
        doc_type: str,
        public_payload: dict[str, Any] | None = None,
        seal_hash: str = "",
        object_type: str = "",
        object_id: str = "",
        expires_at=None,
    ) -> "VerifiableDocument":
        payload = public_payload or {}

        for _ in range(5):
            token = cls.generate_token()
            if not cls.objects.filter(token=token).exists():
                return cls.objects.create(
                    token=token,
                    doc_type=doc_type,
                    public_payload=payload,
                    seal_hash=seal_hash or "",
                    object_type=object_type or "",
                    object_id=object_id or "",
                    expires_at=expires_at,
                )

        # Extremely unlikely, but fail explicitly.
        raise RuntimeError("Could not generate a unique verification token")

    def recompute_status(self) -> str:
        if self.revoked_at:
            return self.Status.REVOKED
        if self.expires_at and timezone.now() >= self.expires_at:
            return self.Status.EXPIRED
        return self.Status.ACTIVE

    def is_valid(self) -> bool:
        return self.recompute_status() == self.Status.ACTIVE


class VerificationEvent(models.Model):
    class Outcome(models.TextChoices):
        NOT_FOUND = "NOT_FOUND", "No encontrado"
        VALID = "VALID", "Válido"
        REVOKED = "REVOKED", "Revocado"
        EXPIRED = "EXPIRED", "Expirado"
        INVALID = "INVALID", "Inválido"

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    token_hash = models.CharField(max_length=64, db_index=True)
    token_prefix = models.CharField(max_length=16, blank=True, default="")

    doc_type = models.CharField(max_length=40, blank=True, default="", db_index=True)
    status = models.CharField(max_length=10, blank=True, default="", db_index=True)
    outcome = models.CharField(max_length=12, choices=Outcome.choices, db_index=True)

    ip_address = models.CharField(max_length=64, blank=True, default="", db_index=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    path = models.CharField(max_length=255, blank=True, default="")
    accept = models.CharField(max_length=128, blank=True, default="")

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()
