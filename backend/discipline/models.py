from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class DisciplineCase(models.Model):
	class Status(models.TextChoices):
		OPEN = "OPEN", "Abierto"
		DECIDED = "DECIDED", "Decidido"
		CLOSED = "CLOSED", "Cerrado"

	class ManualSeverity(models.TextChoices):
		MINOR = "MINOR", "Leve"
		MAJOR = "MAJOR", "Grave"
		VERY_MAJOR = "VERY_MAJOR", "Gravísima"

	class Law1620Type(models.TextChoices):
		TYPE_I = "I", "Tipo I"
		TYPE_II = "II", "Tipo II"
		TYPE_III = "III", "Tipo III"
		UNKNOWN = "UNKNOWN", "Sin clasificar"

	enrollment = models.ForeignKey(
		"students.Enrollment",
		on_delete=models.PROTECT,
		related_name="discipline_cases",
		verbose_name="Matrícula",
	)
	student = models.ForeignKey(
		"students.Student",
		on_delete=models.PROTECT,
		related_name="discipline_cases",
		verbose_name="Estudiante",
	)

	occurred_at = models.DateTimeField(verbose_name="Fecha y hora del hecho")
	location = models.CharField(max_length=200, blank=True, verbose_name="Lugar")
	narrative = models.TextField(verbose_name="Narrativa de los hechos")

	manual_severity = models.CharField(
		max_length=20,
		choices=ManualSeverity.choices,
		default=ManualSeverity.MINOR,
		verbose_name="Clasificación (Manual)",
	)
	law_1620_type = models.CharField(
		max_length=10,
		choices=Law1620Type.choices,
		default=Law1620Type.UNKNOWN,
		verbose_name="Clasificación (Ley 1620)",
	)

	status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

	# Debido proceso (MVP)
	notified_guardian_at = models.DateTimeField(null=True, blank=True)

	# Plazos (MVP+)
	descargos_due_at = models.DateTimeField(null=True, blank=True, verbose_name="Fecha límite descargos")

	decided_at = models.DateTimeField(null=True, blank=True)
	decided_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_cases_decided",
	)
	decision_text = models.TextField(blank=True)

	closed_at = models.DateTimeField(null=True, blank=True)
	closed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_cases_closed",
	)

	# Cadena de custodia (sellado / inmutabilidad)
	sealed_at = models.DateTimeField(null=True, blank=True)
	sealed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_cases_sealed",
	)
	sealed_hash = models.CharField(max_length=64, blank=True, default="")

	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_cases_created",
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-occurred_at", "-id"]

	def save(self, *args, **kwargs):
		if self.enrollment_id and (not self.student_id):
			self.student = self.enrollment.student
		super().save(*args, **kwargs)

	def __str__(self) -> str:
		return f"Caso #{self.pk} - {self.student}"


class DisciplineCaseParticipant(models.Model):
	class Role(models.TextChoices):
		ALLEGED_AGGRESSOR = "ALLEGED_AGGRESSOR", "Presunto agresor"
		ALLEGED_VICTIM = "ALLEGED_VICTIM", "Presunta víctima"
		WITNESS = "WITNESS", "Testigo"
		OTHER = "OTHER", "Otro"

	case = models.ForeignKey(
		DisciplineCase, on_delete=models.CASCADE, related_name="participants"
	)
	student = models.ForeignKey(
		"students.Student",
		on_delete=models.PROTECT,
		related_name="discipline_participations",
	)
	role = models.CharField(max_length=30, choices=Role.choices, default=Role.OTHER)
	notes = models.CharField(max_length=200, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		unique_together = ("case", "student", "role")

	def __str__(self) -> str:
		return f"{self.case_id} - {self.student_id} ({self.role})"


class DisciplineCaseAttachment(models.Model):
	class Kind(models.TextChoices):
		EVIDENCE = "EVIDENCE", "Evidencia"
		DESCARGOS = "DESCARGOS", "Descargos"
		NOTIFICATION = "NOTIFICATION", "Notificación"
		OTHER = "OTHER", "Otro"

	case = models.ForeignKey(
		DisciplineCase, on_delete=models.CASCADE, related_name="attachments"
	)
	kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.EVIDENCE)
	file = models.FileField(upload_to="discipline_case_attachments/")
	description = models.CharField(max_length=200, blank=True)
	uploaded_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_attachments_uploaded",
	)
	uploaded_at = models.DateTimeField(auto_now_add=True)

	def __str__(self) -> str:
		return f"Adjunto #{self.pk} - Caso {self.case_id}"


class DisciplineCaseEvent(models.Model):
	class Type(models.TextChoices):
		CREATED = "CREATED", "Creación"
		NOTE = "NOTE", "Nota"
		NOTIFIED_GUARDIAN = "NOTIFIED_GUARDIAN", "Notificación a acudiente"
		DESCARGOS = "DESCARGOS", "Descargos"
		DECISION = "DECISION", "Decisión"
		CLOSED = "CLOSED", "Cierre"

	case = models.ForeignKey(DisciplineCase, on_delete=models.CASCADE, related_name="events")
	event_type = models.CharField(max_length=30, choices=Type.choices)
	text = models.TextField(blank=True)
	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_events_created",
	)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["created_at", "id"]

	def __str__(self) -> str:
		return f"{self.event_type} - Caso {self.case_id}"


class DisciplineCaseNotificationLog(models.Model):
	class Status(models.TextChoices):
		REGISTERED = "REGISTERED", "Registrada"
		SENT = "SENT", "Enviada"
		FAILED = "FAILED", "Fallida"
		DELIVERED = "DELIVERED", "Entregada"
		READ = "READ", "Leída"
		ACKNOWLEDGED = "ACKNOWLEDGED", "Enterado/Acuse"

	case = models.ForeignKey(
		DisciplineCase, on_delete=models.CASCADE, related_name="notification_logs"
	)
	channel = models.CharField(max_length=30, blank=True, default="")
	status = models.CharField(
		max_length=20, choices=Status.choices, default=Status.REGISTERED
	)

	recipient_user = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_notifications",
	)
	recipient_family_member = models.ForeignKey(
		"students.FamilyMember",
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_notifications",
	)
	recipient_name = models.CharField(max_length=200, blank=True, default="")
	recipient_contact = models.CharField(
		max_length=200,
		blank=True,
		default="",
		help_text="Teléfono/correo u otro identificador del destinatario.",
	)

	note = models.TextField(blank=True, default="")
	external_id = models.CharField(max_length=100, blank=True, default="")
	error = models.TextField(blank=True, default="")

	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_notification_logs_created",
	)
	created_at = models.DateTimeField(auto_now_add=True)

	acknowledged_at = models.DateTimeField(null=True, blank=True)
	acknowledged_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_notification_logs_acknowledged",
	)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["case", "created_at"]),
			models.Index(fields=["recipient_user", "created_at"]),
		]


class ManualConvivencia(models.Model):
	"""Manual de convivencia único por institución (un activo a la vez)."""

	institution = models.ForeignKey(
		"core.Institution",
		on_delete=models.CASCADE,
		related_name="convivencia_manuals",
		verbose_name="Institución",
	)

	title = models.CharField(max_length=200, default="Manual de Convivencia")
	version = models.CharField(max_length=50, blank=True, default="")
	is_active = models.BooleanField(default=False)

	file = models.FileField(upload_to="discipline_manuals/")
	uploaded_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="convivencia_manuals_uploaded",
	)
	uploaded_at = models.DateTimeField(auto_now_add=True)

	# Texto extraído del documento (para recuperación/citas)
	extracted_text = models.TextField(blank=True, default="")
	extracted_at = models.DateTimeField(null=True, blank=True)

	class ExtractionStatus(models.TextChoices):
		PENDING = "PENDING", "Pendiente"
		DONE = "DONE", "Listo"
		FAILED = "FAILED", "Falló"

	extraction_status = models.CharField(
		max_length=20,
		choices=ExtractionStatus.choices,
		default=ExtractionStatus.PENDING,
	)
	extraction_error = models.TextField(blank=True, default="")

	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-uploaded_at", "-id"]
		constraints = [
			models.UniqueConstraint(
				fields=["institution"],
				condition=Q(is_active=True),
				name="uniq_active_convivencia_manual_per_institution",
			)
		]

	def __str__(self) -> str:
		suffix = f" v{self.version}" if self.version else ""
		active = " (activo)" if self.is_active else ""
		return f"{self.title}{suffix}{active}"


class ManualConvivenciaChunk(models.Model):
	manual = models.ForeignKey(
		ManualConvivencia,
		on_delete=models.CASCADE,
		related_name="chunks",
	)
	index = models.PositiveIntegerField()
	text = models.TextField()
	start_char = models.PositiveIntegerField(default=0)
	end_char = models.PositiveIntegerField(default=0)
	label = models.CharField(max_length=200, blank=True, default="")

	class Meta:
		ordering = ["manual_id", "index"]
		unique_together = ("manual", "index")
		indexes = [
			models.Index(fields=["manual", "index"]),
		]

	def __str__(self) -> str:
		return f"Manual {self.manual_id} - Chunk {self.index}"


class DisciplineCaseDecisionSuggestion(models.Model):
	class Status(models.TextChoices):
		DRAFT = "DRAFT", "Borrador"
		APPROVED = "APPROVED", "Aprobado"
		APPLIED = "APPLIED", "Aplicado"
		REJECTED = "REJECTED", "Rechazado"

	case = models.ForeignKey(
		DisciplineCase,
		on_delete=models.CASCADE,
		related_name="decision_suggestions",
	)
	manual = models.ForeignKey(
		ManualConvivencia,
		on_delete=models.PROTECT,
		related_name="decision_suggestions",
	)

	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_decision_suggestions_created",
	)
	created_at = models.DateTimeField(auto_now_add=True)

	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

	# Resultado IA
	suggested_decision_text = models.TextField()
	reasoning = models.TextField(blank=True, default="")
	# Lista de citas verificables: [{chunk_id, quote, label}]
	citations = models.JSONField(default=list, blank=True)

	approved_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_decision_suggestions_approved",
	)
	approved_at = models.DateTimeField(null=True, blank=True)

	applied_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="discipline_case_decision_suggestions_applied",
	)
	applied_at = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["case", "created_at"]),
			models.Index(fields=["manual", "created_at"]),
		]

	def __str__(self) -> str:
		return f"Sugerencia #{self.pk} - Caso {self.case_id} ({self.status})"

	def __str__(self) -> str:
		return f"Notificación #{self.pk} - Caso {self.case_id}"
