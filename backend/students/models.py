from django.conf import settings
from django.db import models
from django.db.models import Q
from django.core.validators import FileExtensionValidator
import hashlib
import json
import uuid
import logging

from core.utils.image_thumbs import WebpThumbSpec, build_webp_thumb_content, make_thumb_name


logger = logging.getLogger(__name__)


def certificate_pdf_upload_to(instance, filename: str) -> str:
    # Keep a deterministic name per issue.
    ext = (filename.rsplit('.', 1)[-1] if filename and '.' in filename else 'pdf').lower()
    return f"certificates/{instance.certificate_type.lower()}/{instance.uuid}.{ext}"


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True
    )
    # Identification
    document_type = models.CharField(max_length=20, blank=True)
    document_number = models.CharField(max_length=50, blank=True, unique=True, verbose_name="Número de documento")
    place_of_issue = models.CharField(max_length=100, blank=True, verbose_name="Lugar de expedición")
    nationality = models.CharField(max_length=50, blank=True, default="Colombiana")
    birth_date = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=1, choices=(('M', 'Masculino'), ('F', 'Femenino')), blank=True)
    blood_type = models.CharField(max_length=5, blank=True)
    
    # Residence & Contact
    address = models.CharField(max_length=255, blank=True)
    neighborhood = models.CharField(max_length=100, blank=True, verbose_name="Barrio/Vereda")
    phone = models.CharField(max_length=20, blank=True)
    living_with = models.CharField(max_length=200, blank=True, verbose_name="Con quién vive")
    stratum = models.CharField(max_length=2, blank=True, verbose_name="Estrato")
    
    # Socioeconomic
    ethnicity = models.CharField(max_length=100, blank=True)
    sisben_score = models.CharField(max_length=20, blank=True, verbose_name="SISBÉN")
    eps = models.CharField(max_length=100, blank=True)
    is_victim_of_conflict = models.BooleanField(default=False, verbose_name="Víctima del conflicto")
    
    # Disability & Support
    has_disability = models.BooleanField(default=False, verbose_name="Tiene discapacidad")
    disability_description = models.TextField(blank=True, verbose_name="Descripción discapacidad")
    disability_type = models.CharField(max_length=100, blank=True, verbose_name="Tipo de discapacidad")
    support_needs = models.TextField(blank=True, verbose_name="Apoyos requeridos")

    # Health & Emergency
    allergies = models.TextField(blank=True, verbose_name="Alergias/Restricciones")
    emergency_contact_name = models.CharField(max_length=200, blank=True, verbose_name="Nombre Contacto Emergencia")
    emergency_contact_phone = models.CharField(max_length=50, blank=True, verbose_name="Teléfono Emergencia")
    emergency_contact_relationship = models.CharField(max_length=50, blank=True, verbose_name="Parentesco Emergencia")

    # New fields for Enrollment Module
    photo = models.ImageField(upload_to='student_photos/', blank=True, null=True, verbose_name="Foto")
    photo_thumb = models.ImageField(
        upload_to='student_photos/thumbs/',
        blank=True,
        null=True,
        editable=False,
        verbose_name="Miniatura",
    )
    financial_status = models.CharField(
        max_length=20,
        choices=(('SOLVENT', 'Paz y Salvo'), ('DEBT', 'En Mora')),
        default='SOLVENT',
        verbose_name="Estado Financiero"
    )

    def __str__(self) -> str:
        return f"{self.user.get_full_name()} ({self.user.username})"

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and set(update_fields).issubset({"photo_thumb"}):
            return super().save(*args, **kwargs)

        old_photo_name = None
        old_thumb_name = None
        if self.pk:
            old = Student.objects.filter(pk=self.pk).only("photo", "photo_thumb").first()
            if old:
                old_photo_name = old.photo.name if old.photo else None
                old_thumb_name = old.photo_thumb.name if old.photo_thumb else None

        result = super().save(*args, **kwargs)

        new_photo_name = self.photo.name if self.photo else None
        photo_changed = old_photo_name != new_photo_name

        # If the original photo is removed, clear the thumb too.
        if not self.photo:
            if old_thumb_name:
                try:
                    self.photo_thumb.storage.delete(old_thumb_name)
                except Exception:
                    logger.exception("Failed deleting student photo thumb %s", old_thumb_name)

            if self.photo_thumb:
                self.photo_thumb = None
                super().save(update_fields=["photo_thumb"])
            return result

        # Regenerate when photo changed or thumb missing.
        if photo_changed or not self.photo_thumb:
            if old_thumb_name:
                try:
                    self.photo_thumb.storage.delete(old_thumb_name)
                except Exception:
                    logger.exception("Failed deleting student photo thumb %s", old_thumb_name)

            try:
                if not self.photo.storage.exists(self.photo.name):
                    logger.warning(
                        "Student photo missing in storage; skipping thumb generation (student_id=%s, name=%s)",
                        self.pk,
                        self.photo.name,
                    )
                    return result
                self.photo.open("rb")
                content = build_webp_thumb_content(self.photo.file, WebpThumbSpec(max_size=256))
                thumb_name = make_thumb_name(self.photo.name, "student_photos/thumbs")
                try:
                    if self.photo_thumb.storage.exists(thumb_name):
                        self.photo_thumb.storage.delete(thumb_name)
                except Exception:
                    logger.exception("Failed deleting existing thumb name %s", thumb_name)
                self.photo_thumb.save(thumb_name, content, save=False)
                super().save(update_fields=["photo_thumb"])
            except Exception:
                logger.exception("Failed generating student photo thumbnail (student_id=%s)", self.pk)

        return result

    def delete(self, *args, **kwargs):
        if self.photo_thumb:
            try:
                self.photo_thumb.delete(save=False)
            except Exception:
                logger.exception("Failed deleting student photo thumb on delete (student_id=%s)", self.pk)
        return super().delete(*args, **kwargs)


class FamilyMember(models.Model):
    student = models.ForeignKey(
        Student, related_name="family_members", on_delete=models.CASCADE
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    full_name = models.CharField(max_length=200)
    document_number = models.CharField(max_length=50, blank=True, verbose_name="Cédula")
    identity_document = models.FileField(
        upload_to='family_identity_documents/',
        blank=True,
        null=True,
        verbose_name="Documento de identidad (archivo)",
        validators=[FileExtensionValidator(allowed_extensions=['pdf', 'png', 'jpg', 'jpeg', 'webp'])],
    )
    relationship = models.CharField(max_length=50)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    is_main_guardian = models.BooleanField(default=False)
    is_head_of_household = models.BooleanField(default=False, verbose_name="Cabeza de familia")

    def __str__(self) -> str:
        return f"{self.full_name} - {self.relationship}"


class Enrollment(models.Model):
    from academic.models import AcademicYear, Grade, Group
    from core.models import Campus

    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE)
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE)
    group = models.ForeignKey(Group, on_delete=models.SET_NULL, null=True, blank=True)
    campus = models.ForeignKey(Campus, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=(
            ("ACTIVE", "Activo"),
            ("RETIRED", "Retirado"),
            ("GRADUATED", "Graduado"),
        ),
        default="ACTIVE",
    )
    origin_school = models.CharField(max_length=200, blank=True, verbose_name="Procedencia")
    final_status = models.CharField(max_length=50, blank=True, verbose_name="Promoción")

    enrolled_at = models.DateField(
        null=True,
        blank=True,
        verbose_name="Fecha de ingreso",
        help_text="Fecha de ingreso al año lectivo (útil para estudiantes que entran a mitad de año).",
    )

    class Meta:
        unique_together = ("student", "academic_year")

    def __str__(self) -> str:
        return f"{self.student} - {self.academic_year} - {self.grade}"


class ConditionalPromotionPlan(models.Model):
    STATUS_OPEN = "OPEN"
    STATUS_CLEARED = "CLEARED"
    STATUS_FAILED = "FAILED"

    STATUS_CHOICES = (
        (STATUS_OPEN, "Pendiente"),
        (STATUS_CLEARED, "Aprobado / superado"),
        (STATUS_FAILED, "No superado"),
    )

    enrollment = models.OneToOneField(
        Enrollment,
        related_name="conditional_plan",
        on_delete=models.CASCADE,
    )
    source_enrollment = models.ForeignKey(
        Enrollment,
        related_name="conditional_plans_created_from",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Matrícula de origen (año anterior) desde la cual se definió la promoción condicional.",
    )
    due_period = models.ForeignKey(
        "academic.Period",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Periodo límite (normalmente el primer periodo del año siguiente).",
    )

    pending_subject_ids = models.JSONField(default=list, blank=True)
    pending_area_ids = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Plan de promoción condicional (PAP)"
        verbose_name_plural = "Planes de promoción condicional (PAP)"

    def __str__(self) -> str:
        return f"PAP {self.enrollment} ({self.get_status_display()})"


class StudentNovelty(models.Model):
    NOVELTY_TYPES = (
        ("INGRESO", "Ingreso"),
        ("RETIRO", "Retiro"),
        ("REINGRESO", "Reingreso"),
        ("OTRO", "Otro"),
    )
    student = models.ForeignKey(
        Student, related_name="novelties", on_delete=models.CASCADE
    )
    novelty_type = models.CharField(max_length=20, choices=NOVELTY_TYPES)
    date = models.DateField()
    observation = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.get_novelty_type_display()} - {self.student} ({self.date})"


class StudentDocument(models.Model):
    DOCUMENT_TYPES = (
        ('IDENTITY', 'Documento de Identidad'),
        ('GUARDIAN_IDENTITY', 'Documento de identidad del acudiente'),
        ('VACCINES', 'Carnet de Vacunas'),
        ('EPS', 'Certificado EPS'),
        ('ACADEMIC', 'Certificado Académico Anterior'),
        ('PHOTO', 'Foto Tipo Documento'),
        ('OTHER', 'Otro'),
    )
    student = models.ForeignKey(Student, related_name='documents', on_delete=models.CASCADE)
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPES)
    file = models.FileField(upload_to='student_documents/')
    description = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_document_type_display()} - {self.student}"


class ObserverAnnotation(models.Model):
    """Manual or automatic observer notes linked to a student (optionally a period).

    Supports audit trail (created/updated/deleted by) and soft-delete.
    """

    TYPE_PRAISE = "PRAISE"
    TYPE_OBSERVATION = "OBSERVATION"
    TYPE_ALERT = "ALERT"
    TYPE_COMMITMENT = "COMMITMENT"
    TYPE_CHOICES = (
        (TYPE_PRAISE, "Felicitación"),
        (TYPE_OBSERVATION, "Observación"),
        (TYPE_ALERT, "Llamado de atención"),
        (TYPE_COMMITMENT, "Compromiso"),
    )

    student = models.ForeignKey(
        Student,
        related_name="observer_annotations",
        on_delete=models.CASCADE,
    )
    period = models.ForeignKey(
        "academic.Period",
        related_name="observer_annotations",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    annotation_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OBSERVATION)
    title = models.CharField(max_length=200, blank=True)
    text = models.TextField()

    commitments = models.TextField(blank=True)
    commitment_due_date = models.DateField(null=True, blank=True)
    commitment_responsible = models.CharField(max_length=120, blank=True)

    is_automatic = models.BooleanField(default=False)
    rule_key = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        help_text="Clave para idempotencia en anotaciones automáticas (por estudiante+periodo).",
    )
    meta = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="observer_annotations_created",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="observer_annotations_updated",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="observer_annotations_deleted",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "period", "rule_key"],
                condition=Q(rule_key__isnull=False) & Q(is_deleted=False),
                name="uniq_observer_annotation_rule_per_student_period",
            )
        ]

    def __str__(self) -> str:
        return f"ObserverAnnotation {self.student_id} {self.annotation_type} ({self.created_at})"


class CertificateIssue(models.Model):
    """Issued certificates, used for QR verification (public endpoint)."""

    TYPE_STUDIES = "STUDIES"
    TYPE_CHOICES = (
        (TYPE_STUDIES, "Certificado de estudios"),
    )

    STATUS_PENDING = "PENDING"
    STATUS_ISSUED = "ISSUED"
    STATUS_REVOKED = "REVOKED"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pendiente"),
        (STATUS_ISSUED, "Emitido"),
        (STATUS_REVOKED, "Revocado"),
    )

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    certificate_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default=TYPE_STUDIES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ISSUED)

    enrollment = models.ForeignKey(
        "students.Enrollment",
        related_name="issued_certificates",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="issued_certificates",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    issued_at = models.DateTimeField(auto_now_add=True)

    amount_cop = models.PositiveIntegerField(
        default=10000,
        help_text="Valor cobrado por este certificado (se guarda al emitir).",
    )

    pdf_file = models.FileField(
        upload_to=certificate_pdf_upload_to,
        blank=True,
        null=True,
        help_text="Copia del PDF generado para auditoría y re-descarga.",
    )

    # Storage privado (fuera de MEDIA). Si está presente, debe preferirse sobre pdf_file.
    pdf_private_relpath = models.CharField(max_length=512, blank=True, null=True)
    pdf_private_filename = models.CharField(max_length=255, blank=True, null=True)

    # Snapshot of data used to render the certificate (manual student details, year, grade, rows, etc.).
    payload = models.JSONField(default=dict, blank=True)
    seal_hash = models.CharField(max_length=64, blank=True)

    revoked_at = models.DateTimeField(null=True, blank=True)
    revoke_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["uuid"], name="idx_cert_issue_uuid"),
            models.Index(fields=["certificate_type", "status"], name="idx_cert_issue_type_status"),
        ]

    def __str__(self) -> str:
        return f"{self.get_certificate_type_display()} - {self.uuid}"

    def _compute_seal_hash(self) -> str:
        data = {
            "uuid": str(self.uuid),
            "certificate_type": self.certificate_type,
            "issued_at": self.issued_at.isoformat() if self.issued_at else "",
            "payload": self.payload or {},
        }
        raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def save(self, *args, **kwargs):
        creating = self._state.adding
        super().save(*args, **kwargs)

        # Compute seal after we have issued_at.
        if (creating or not self.seal_hash) and self.issued_at:
            seal = self._compute_seal_hash()
            if self.seal_hash != seal:
                self.seal_hash = seal
                super().save(update_fields=["seal_hash"])
