from __future__ import annotations

from django.conf import settings
from django.db import models


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

	def __str__(self) -> str:
		return f"Notificación #{self.pk} - Caso {self.case_id}"
