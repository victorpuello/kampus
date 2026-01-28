from __future__ import annotations

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

import uuid


def novelty_attachment_upload_to(instance: "NoveltyAttachment", filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if filename and "." in filename else "bin").lower()
    safe_ext = ext if ext in {"pdf", "png", "jpg", "jpeg"} else "bin"
    return f"novelties/attachments/{instance.case_id}/{uuid.uuid4().hex}.{safe_ext}"


class NoveltyRadicadoCounter(models.Model):
    institution = models.ForeignKey(
        "core.Institution",
        on_delete=models.CASCADE,
        related_name="novelty_radicado_counters",
    )
    year = models.PositiveIntegerField()
    last_seq = models.PositiveIntegerField(default=0)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("institution", "year")

    def __str__(self) -> str:
        return f"{self.institution_id}:{self.year} -> {self.last_seq}"


class NoveltyType(models.Model):
    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=160)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class NoveltyReason(models.Model):
    novelty_type = models.ForeignKey(NoveltyType, on_delete=models.PROTECT, related_name="reasons")
    name = models.CharField(max_length=160)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["novelty_type__name", "name"]
        unique_together = ("novelty_type", "name")

    def __str__(self) -> str:
        return f"{self.novelty_type.code}: {self.name}"


class NoveltyCase(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        FILED = "FILED", "Radicada"
        IN_REVIEW = "IN_REVIEW", "En revisión"
        PENDING_DOCS = "PENDING_DOCS", "Pendiente de documentación"
        APPROVED = "APPROVED", "Aprobada"
        REJECTED = "REJECTED", "Rechazada"
        EXECUTED = "EXECUTED", "Ejecutada"
        REVERTED = "REVERTED", "Revertida"
        CLOSED = "CLOSED", "Cerrada"

    student = models.ForeignKey(
        "students.Student",
        on_delete=models.PROTECT,
        related_name="novelty_cases",
    )

    institution = models.ForeignKey(
        "core.Institution",
        on_delete=models.PROTECT,
        related_name="novelty_cases",
        null=True,
        blank=True,
        help_text="Institución responsable del radicado y del flujo.",
    )
    novelty_type = models.ForeignKey(NoveltyType, on_delete=models.PROTECT, related_name="cases")
    novelty_reason = models.ForeignKey(
        NoveltyReason,
        on_delete=models.PROTECT,
        related_name="cases",
        null=True,
        blank=True,
    )

    status = models.CharField(max_length=24, choices=Status.choices, default=Status.DRAFT)

    radicado = models.CharField(max_length=32, blank=True, default="")
    radicado_year = models.PositiveIntegerField(null=True, blank=True)
    radicado_seq = models.PositiveIntegerField(null=True, blank=True)
    filed_at = models.DateTimeField(null=True, blank=True)

    requested_at = models.DateTimeField(default=timezone.now)
    effective_date = models.DateField(null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_novelty_cases",
        null=True,
        blank=True,
    )

    payload = models.JSONField(default=dict, blank=True)

    # Idempotency for execution attempts (client-generated recommended).
    idempotency_key = models.CharField(max_length=80, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["radicado"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["institution", "radicado_year", "radicado_seq"],
                name="uniq_novelty_radicado_per_institution_year",
            )
        ]

    def __str__(self) -> str:
        return f"{self.radicado or self.pk} - {self.student_id} - {self.novelty_type.code}"


class NoveltyExecution(models.Model):
    case = models.OneToOneField(NoveltyCase, on_delete=models.CASCADE, related_name="execution")

    idempotency_key = models.CharField(max_length=80)

    executed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="novelty_executions",
        null=True,
        blank=True,
    )
    executed_at = models.DateTimeField(default=timezone.now)

    before_snapshot = models.JSONField(default=dict, blank=True)
    after_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["idempotency_key"], name="uniq_novelty_execution_idempotency_key"),
        ]

    def __str__(self) -> str:
        return f"{self.case_id} executed"


class NoveltyReversion(models.Model):
    case = models.OneToOneField(NoveltyCase, on_delete=models.CASCADE, related_name="reversion")

    reverted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="novelty_reversions",
        null=True,
        blank=True,
    )
    reverted_at = models.DateTimeField(default=timezone.now)
    comment = models.TextField(blank=True, default="")

    before_snapshot = models.JSONField(default=dict, blank=True)
    after_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-reverted_at"]

    def __str__(self) -> str:
        return f"{self.case_id} reverted"


class NoveltyRequiredDocumentRule(models.Model):
    class Visibility(models.TextChoices):
        ALL = "ALL", "Todos"
        ADMIN_ONLY = "ADMIN_ONLY", "Solo Admin"
        COORDINATOR_ONLY = "COORDINATOR_ONLY", "Solo Coordinación"
        SECRETARY_ONLY = "SECRETARY_ONLY", "Solo Secretaría"

    novelty_type = models.ForeignKey(NoveltyType, on_delete=models.CASCADE, related_name="required_document_rules")
    novelty_reason = models.ForeignKey(
        NoveltyReason,
        on_delete=models.CASCADE,
        related_name="required_document_rules",
        null=True,
        blank=True,
        help_text="Si se define, la regla aplica solo cuando el caso tenga este motivo.",
    )

    doc_type = models.SlugField(max_length=64, help_text="Código del tipo de documento (ej. acta_retiro)")
    is_required = models.BooleanField(default=True)
    visibility = models.CharField(max_length=24, choices=Visibility.choices, default=Visibility.ALL)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["novelty_type__name", "doc_type"]
        unique_together = ("novelty_type", "novelty_reason", "doc_type")

    def __str__(self) -> str:
        reason = f"/{self.novelty_reason.name}" if self.novelty_reason_id else ""
        return f"{self.novelty_type.code}{reason}:{self.doc_type}"


class NoveltyAttachment(models.Model):
    class Visibility(models.TextChoices):
        ALL = "ALL", "Todos"
        ADMIN_ONLY = "ADMIN_ONLY", "Solo Admin"
        COORDINATOR_ONLY = "COORDINATOR_ONLY", "Solo Coordinación"
        SECRETARY_ONLY = "SECRETARY_ONLY", "Solo Secretaría"

    case = models.ForeignKey(NoveltyCase, on_delete=models.CASCADE, related_name="attachments")

    doc_type = models.SlugField(max_length=64)
    file = models.FileField(
        upload_to=novelty_attachment_upload_to,
        validators=[FileExtensionValidator(allowed_extensions=["pdf", "png", "jpg", "jpeg"])],
    )

    issued_at = models.DateField(null=True, blank=True)
    issued_by = models.CharField(max_length=200, blank=True, default="")
    valid_until = models.DateField(null=True, blank=True)

    visibility = models.CharField(max_length=24, choices=Visibility.choices, default=Visibility.ALL)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="novelty_attachments_uploaded",
        null=True,
        blank=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["case", "doc_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.case_id}:{self.doc_type}"


class NoveltyCaseTransition(models.Model):
    case = models.ForeignKey(NoveltyCase, on_delete=models.CASCADE, related_name="transitions")

    from_status = models.CharField(max_length=24, choices=NoveltyCase.Status.choices)
    to_status = models.CharField(max_length=24, choices=NoveltyCase.Status.choices)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="novelty_case_transitions",
        null=True,
        blank=True,
    )
    actor_role = models.CharField(max_length=24, blank=True, default="")

    comment = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.case_id}: {self.from_status} -> {self.to_status}"


class CapacityBucket(models.Model):
    """Macro capacity by campus + grade + year + shift (optional modality).

    Used to avoid over-enrollment across multiple groups.
    """

    campus = models.ForeignKey("core.Campus", on_delete=models.CASCADE, related_name="capacity_buckets")
    grade = models.ForeignKey("academic.Grade", on_delete=models.CASCADE, related_name="capacity_buckets")
    academic_year = models.ForeignKey("academic.AcademicYear", on_delete=models.CASCADE, related_name="capacity_buckets")
    shift = models.CharField(max_length=20, default="MORNING")
    modality = models.SlugField(max_length=40, blank=True, default="")

    capacity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("campus", "grade", "academic_year", "shift", "modality")
        indexes = [
            models.Index(fields=["campus", "grade", "academic_year", "shift", "modality"]),
        ]

    def __str__(self) -> str:
        mod = f"/{self.modality}" if self.modality else ""
        return f"Bucket {self.campus_id}:{self.grade_id}:{self.academic_year_id}:{self.shift}{mod} = {self.capacity}"


class GroupCapacityOverride(models.Model):
    """Optional capacity override per group.

    If present, it is combined with bucket capacity using the most restrictive value.
    """

    group = models.OneToOneField("academic.Group", on_delete=models.CASCADE, related_name="capacity_override")
    capacity = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Override {self.group_id} = {self.capacity}"
