from __future__ import annotations

import hashlib
import uuid
import unicodedata
from datetime import timedelta

from django.db import models
from django.utils import timezone
from django.conf import settings
from django.core.exceptions import ValidationError


class ElectionProcess(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        OPEN = "OPEN", "Abierta"
        CLOSED = "CLOSED", "Cerrada"

    name = models.CharField(max_length=160)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name

    def is_open(self) -> bool:
        now = timezone.now()
        if self.status != self.Status.OPEN:
            return False
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now > self.ends_at:
            return False
        return True


class ElectionRole(models.Model):
    CODE_PERSONERO = "PERSONERO"
    CODE_CONTRALOR = "CONTRALOR"
    ALLOWED_CODES = {CODE_PERSONERO, CODE_CONTRALOR}

    process = models.ForeignKey(ElectionProcess, on_delete=models.CASCADE, related_name="roles")
    code = models.CharField(max_length=40)
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["process", "code"], name="uniq_election_role_process_code"),
        ]

    def __str__(self) -> str:
        return f"{self.process_id}:{self.title}"

    def clean(self):
        super().clean()
        normalized_code = (self.code or "").strip().upper()
        if normalized_code not in self.ALLOWED_CODES:
            raise ValidationError(
                {
                    "code": "Solo se permiten cargos de Personería o Contraloría.",
                }
            )
        self.code = normalized_code

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class ElectionCandidate(models.Model):
    role = models.ForeignKey(ElectionRole, on_delete=models.CASCADE, related_name="candidates")
    name = models.CharField(max_length=160)
    student_id_ref = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    student_document_number = models.CharField(max_length=60, blank=True, db_index=True)
    number = models.CharField(max_length=20)
    grade = models.CharField(max_length=20, default="")
    proposal = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["role", "number"], name="uniq_election_candidate_role_number"),
        ]

    def __str__(self) -> str:
        return f"{self.role_id}:{self.number}-{self.name}"

    @staticmethod
    def _normalize_grade_to_int(raw_grade: str) -> int | None:
        value = (raw_grade or "").strip().lower().replace("°", "")
        value = "".join(ch for ch in unicodedata.normalize("NFD", value) if unicodedata.category(ch) != "Mn")
        compact = value.replace(" ", "")
        map_words = {
            "once": 11,
            "undecimo": 11,
            "decimoprimero": 11,
            "decimo": 10,
            "noveno": 9,
            "octavo": 8,
            "septimo": 7,
            "sexto": 6,
        }
        if compact.isdigit():
            return int(compact)
        return map_words.get(compact)

    def clean(self):
        super().clean()
        normalized_grade = (self.grade or "").strip()
        parsed_grade = self._normalize_grade_to_int(normalized_grade)

        if parsed_grade is None:
            raise ValidationError({"grade": "Debes indicar un grado válido (por ejemplo 11 u Once)."})

        role_code = (self.role.code or "").strip().upper()
        if role_code == ElectionRole.CODE_PERSONERO and parsed_grade != 11:
            raise ValidationError({"grade": "La candidatura de Personería debe pertenecer al grado 11 (último grado ofrecido)."})

        if role_code == ElectionRole.CODE_CONTRALOR and not (6 <= parsed_grade <= 11):
            raise ValidationError({"grade": "La candidatura de Contraloría debe pertenecer entre grado 6 y 11."})

        self.grade = normalized_grade

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class CandidatoPersoneriaManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(role__code=ElectionRole.CODE_PERSONERO)


class CandidatoPersoneria(ElectionCandidate):
    objects = CandidatoPersoneriaManager()

    class Meta:
        proxy = True
        verbose_name = "Candidato de Personería"
        verbose_name_plural = "Candidatos de Personería"

    def clean(self):
        if self.role and (self.role.code or "").strip().upper() != ElectionRole.CODE_PERSONERO:
            raise ValidationError({"role": "Este registro solo admite candidaturas de Personería."})
        super().clean()


class CandidatoContraloriaManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(role__code=ElectionRole.CODE_CONTRALOR)


class CandidatoContraloria(ElectionCandidate):
    objects = CandidatoContraloriaManager()

    class Meta:
        proxy = True
        verbose_name = "Candidato de Contraloría"
        verbose_name_plural = "Candidatos de Contraloría"

    def clean(self):
        if self.role and (self.role.code or "").strip().upper() != ElectionRole.CODE_CONTRALOR:
            raise ValidationError({"role": "Este registro solo admite candidaturas de Contraloría."})
        super().clean()


class VoterToken(models.Model):
    DASH_VARIANTS = ("–", "—", "−", "‑", "﹣", "－")
    INVISIBLE_CHARS = ("\u200b", "\u200c", "\u200d", "\ufeff")

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Activo"
        USED = "USED", "Usado"
        REVOKED = "REVOKED", "Revocado"
        EXPIRED = "EXPIRED", "Expirado"

    process = models.ForeignKey(ElectionProcess, on_delete=models.CASCADE, related_name="voter_tokens")
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    token_prefix = models.CharField(max_length=12, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=255, blank=True)
    student_grade = models.CharField(max_length=30, blank=True)
    student_shift = models.CharField(max_length=30, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("reset_votertoken", "Can reset voter token for contingency"),
        ]

    def __str__(self) -> str:
        return f"{self.process_id}:{self.token_prefix or 'TOKEN'}"

    @classmethod
    def hash_token(cls, raw_token: str) -> str:
        return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

    @classmethod
    def normalize_token_input(cls, raw_token: str) -> str:
        normalized = (raw_token or "").strip()
        result_chars: list[str] = []
        for ch in normalized:
            if ch in cls.INVISIBLE_CHARS or ch.isspace():
                continue
            if unicodedata.category(ch) == "Pd":
                result_chars.append("-")
                continue
            result_chars.append(ch)
        return "".join(result_chars).upper()

    @classmethod
    def hash_token_candidates(cls, raw_token: str) -> list[str]:
        raw = (raw_token or "").strip()
        normalized = cls.normalize_token_input(raw_token)

        candidate_values: list[str] = []
        if raw:
            candidate_values.append(raw)
        if normalized and normalized not in candidate_values:
            candidate_values.append(normalized)
        if normalized and "-" not in normalized and normalized.startswith("VOTO") and len(normalized) > 4:
            normalized_with_dash = f"VOTO-{normalized[4:]}"
            if normalized_with_dash not in candidate_values:
                candidate_values.append(normalized_with_dash)
        normalized_without_dash = normalized.replace("-", "") if normalized else ""
        if normalized_without_dash and normalized_without_dash not in candidate_values:
            candidate_values.append(normalized_without_dash)

        candidate_hashes: list[str] = []
        seen_hashes: set[str] = set()
        for value in candidate_values:
            token_hash = hashlib.sha256(value.encode("utf-8")).hexdigest()
            if token_hash in seen_hashes:
                continue
            seen_hashes.add(token_hash)
            candidate_hashes.append(token_hash)
        return candidate_hashes

    def recompute_status(self) -> str:
        if self.status == self.Status.REVOKED:
            return self.Status.REVOKED
        if self.status == self.Status.USED:
            return self.Status.USED
        if self.expires_at and timezone.now() > self.expires_at:
            return self.Status.EXPIRED
        return self.Status.ACTIVE

    def ensure_fresh_status(self) -> str:
        next_status = self.recompute_status()
        if next_status != self.status:
            self.status = next_status
            self.save(update_fields=["status"])
        return self.status


class VoteAccessSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    voter_token = models.ForeignKey(VoterToken, on_delete=models.CASCADE, related_name="access_sessions")
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return str(self.id)

    @classmethod
    def default_expiration(cls) -> timezone.datetime:
        return timezone.now() + timedelta(minutes=15)

    def is_active(self) -> bool:
        return self.consumed_at is None and timezone.now() <= self.expires_at


class VoteRecord(models.Model):
    process = models.ForeignKey(ElectionProcess, on_delete=models.CASCADE, related_name="votes")
    role = models.ForeignKey(ElectionRole, on_delete=models.CASCADE, related_name="votes")
    candidate = models.ForeignKey(ElectionCandidate, on_delete=models.SET_NULL, null=True, blank=True, related_name="votes")
    voter_token = models.ForeignKey(VoterToken, on_delete=models.CASCADE, related_name="votes")
    access_session = models.ForeignKey(VoteAccessSession, on_delete=models.CASCADE, related_name="votes")
    is_blank = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["process", "created_at"], name="evr_proc_created_idx"),
            models.Index(fields=["process", "role", "created_at"], name="evr_proc_role_ct_idx"),
            models.Index(fields=["process", "is_blank", "created_at"], name="evr_proc_blank_ct_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["voter_token", "role"], name="uniq_vote_per_token_and_role"),
            models.UniqueConstraint(fields=["access_session", "role"], name="uniq_vote_per_session_and_role"),
        ]

    def __str__(self) -> str:
        return f"vote:{self.process_id}:{self.role_id}:{self.voter_token_id}"


class TokenResetEvent(models.Model):
    voter_token = models.ForeignKey(VoterToken, on_delete=models.CASCADE, related_name="reset_events")
    reset_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="token_reset_events",
    )
    reason = models.CharField(max_length=500)
    previous_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20, default=VoterToken.Status.ACTIVE)
    previous_expires_at = models.DateTimeField(null=True, blank=True)
    new_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"reset:{self.voter_token_id}:{self.created_at:%Y-%m-%d %H:%M}"


class ElectionCensusSync(models.Model):
    class Mode(models.TextChoices):
        DRY_RUN = "DRY_RUN", "Simulación"
        APPLY = "APPLY", "Aplicado"

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Exitoso"
        PARTIAL = "PARTIAL", "Parcial"
        FAILED = "FAILED", "Fallido"

    source_name = models.CharField(max_length=120, default="institutional_api")
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.DRY_RUN)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUCCESS)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    received_count = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    deactivated_count = models.PositiveIntegerField(default=0)
    unchanged_count = models.PositiveIntegerField(default=0)
    errors_count = models.PositiveIntegerField(default=0)
    summary = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-started_at", "-id"]

    def __str__(self) -> str:
        return f"census-sync:{self.id}:{self.mode}:{self.status}"


class ElectionCensusMember(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Activo"
        INACTIVE = "INACTIVE", "Inactivo"

    student_external_id = models.CharField(max_length=120, unique=True, db_index=True)
    document_number = models.CharField(max_length=60, blank=True)
    full_name = models.CharField(max_length=220, blank=True)
    grade = models.CharField(max_length=30, blank=True)
    shift = models.CharField(max_length=40, blank=True)
    campus = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    is_active = models.BooleanField(default=True, db_index=True)
    last_sync = models.ForeignKey(ElectionCensusSync, on_delete=models.SET_NULL, null=True, blank=True, related_name="members")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["student_external_id"]

    def __str__(self) -> str:
        return self.student_external_id


class ElectionCensusChangeEvent(models.Model):
    class ChangeType(models.TextChoices):
        CREATE = "CREATE", "Alta"
        UPDATE = "UPDATE", "Actualización"
        DEACTIVATE = "DEACTIVATE", "Desactivación"
        REACTIVATE = "REACTIVATE", "Reactivación"

    sync = models.ForeignKey(ElectionCensusSync, on_delete=models.CASCADE, related_name="events")
    member = models.ForeignKey(ElectionCensusMember, on_delete=models.SET_NULL, null=True, blank=True, related_name="change_events")
    student_external_id = models.CharField(max_length=120, db_index=True)
    change_type = models.CharField(max_length=20, choices=ChangeType.choices)
    before_payload = models.JSONField(default=dict, blank=True)
    after_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"census-event:{self.student_external_id}:{self.change_type}"


class ElectionOpeningRecord(models.Model):
    process = models.OneToOneField(ElectionProcess, on_delete=models.CASCADE, related_name="opening_record")
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="election_opening_records",
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    votes_count_at_open = models.PositiveIntegerField(default=0)
    blank_votes_count_at_open = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-opened_at", "-id"]

    def __str__(self) -> str:
        return f"opening-record:{self.process_id}:{self.opened_at:%Y-%m-%d %H:%M}"


class ElectionProcessCensusExclusion(models.Model):
    process = models.ForeignKey(ElectionProcess, on_delete=models.CASCADE, related_name="census_exclusions")
    census_member = models.ForeignKey(ElectionCensusMember, on_delete=models.CASCADE, related_name="process_exclusions")
    reason = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="election_census_exclusions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["process", "census_member"],
                name="uniq_election_process_census_exclusion",
            )
        ]

    def __str__(self) -> str:
        return f"census-exclusion:{self.process_id}:{self.census_member_id}"
