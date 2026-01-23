from django.conf import settings
from django.db import models
from django.utils import timezone


class ReportJob(models.Model):
	class Status(models.TextChoices):
		PENDING = "PENDING", "Pendiente"
		RUNNING = "RUNNING", "En proceso"
		SUCCEEDED = "SUCCEEDED", "Completado"
		FAILED = "FAILED", "Fallido"
		CANCELED = "CANCELED", "Cancelado"

	class ReportType(models.TextChoices):
		DUMMY = "DUMMY", "Dummy (prueba)"
		ACADEMIC_PERIOD_ENROLLMENT = "ACADEMIC_PERIOD_ENROLLMENT", "Informe académico (matrícula/periodo)"
		ACADEMIC_PERIOD_GROUP = "ACADEMIC_PERIOD_GROUP", "Informe académico (grupo/periodo)"
		DISCIPLINE_CASE_ACTA = "DISCIPLINE_CASE_ACTA", "Acta de caso disciplinario"
		ATTENDANCE_MANUAL_SHEET = "ATTENDANCE_MANUAL_SHEET", "Planilla de asistencia (manual)"
		ENROLLMENT_LIST = "ENROLLMENT_LIST", "Reporte de matriculados"
		GRADE_REPORT_SHEET = "GRADE_REPORT_SHEET", "Planilla imprimible de notas"
		TEACHER_STATISTICS_AI = "TEACHER_STATISTICS_AI", "Estadísticas IA (docente)"
		CERTIFICATE_STUDIES = "CERTIFICATE_STUDIES", "Certificado de estudios"

	created_by = models.ForeignKey(
		settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="report_jobs"
	)
	report_type = models.CharField(max_length=64, choices=ReportType.choices)
	params = models.JSONField(default=dict, blank=True)

	status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
	progress = models.PositiveSmallIntegerField(null=True, blank=True)

	created_at = models.DateTimeField(auto_now_add=True)
	started_at = models.DateTimeField(null=True, blank=True)
	finished_at = models.DateTimeField(null=True, blank=True)
	expires_at = models.DateTimeField(null=True, blank=True)

	output_relpath = models.CharField(max_length=512, null=True, blank=True)
	output_filename = models.CharField(max_length=255, null=True, blank=True)
	output_content_type = models.CharField(max_length=128, default="application/pdf")
	output_size_bytes = models.BigIntegerField(null=True, blank=True)

	error_code = models.CharField(max_length=64, null=True, blank=True)
	error_message = models.TextField(null=True, blank=True)

	def add_event(self, *, event_type: str, message: str = "", level: str = "INFO", meta: dict | None = None) -> None:
		ReportJobEvent.objects.create(
			job=self,
			event_type=event_type,
			level=level,
			message=message,
			meta=meta or {},
		)

	def mark_running(self) -> None:
		if self.status != self.Status.RUNNING:
			self.status = self.Status.RUNNING
			self.started_at = timezone.now()
			self.progress = 0
			self.save(update_fields=["status", "started_at", "progress"])
			self.add_event(event_type="RUNNING")

	def set_progress(self, progress: int | None) -> None:
		self.progress = progress
		self.save(update_fields=["progress"])

	def mark_failed(self, *, error_code: str = "ERROR", error_message: str = "") -> None:
		self.status = self.Status.FAILED
		self.finished_at = timezone.now()
		self.progress = None
		self.error_code = error_code
		self.error_message = error_message
		self.save(update_fields=["status", "finished_at", "progress", "error_code", "error_message"])
		self.add_event(event_type="FAILED", level="ERROR", message=error_message, meta={"error_code": error_code})

	def mark_canceled(self) -> None:
		if self.status == self.Status.CANCELED:
			return
		self.status = self.Status.CANCELED
		self.finished_at = timezone.now()
		self.progress = None
		self.save(update_fields=["status", "finished_at", "progress"])
		self.add_event(event_type="CANCELED")

	def mark_succeeded(
		self,
		*,
		output_relpath: str,
		output_filename: str,
		output_size_bytes: int | None = None,
		content_type: str = "application/pdf",
	) -> None:
		self.status = self.Status.SUCCEEDED
		self.finished_at = timezone.now()
		self.progress = 100
		self.output_relpath = output_relpath
		self.output_filename = output_filename
		self.output_content_type = content_type
		self.output_size_bytes = output_size_bytes
		self.error_code = None
		self.error_message = None
		self.save(
			update_fields=[
				"status",
				"finished_at",
				"progress",
				"output_relpath",
				"output_filename",
				"output_content_type",
				"output_size_bytes",
				"error_code",
				"error_message",
			]
		)
		self.add_event(event_type="SUCCEEDED", meta={"output_filename": output_filename, "output_size_bytes": output_size_bytes})

	def __str__(self) -> str:
		return f"ReportJob({self.id}) {self.report_type} {self.status}"


class ReportJobEvent(models.Model):
	class Level(models.TextChoices):
		INFO = "INFO", "Info"
		WARNING = "WARNING", "Warning"
		ERROR = "ERROR", "Error"

	job = models.ForeignKey(ReportJob, on_delete=models.CASCADE, related_name="events")
	created_at = models.DateTimeField(auto_now_add=True)
	event_type = models.CharField(max_length=64)
	level = models.CharField(max_length=16, choices=Level.choices, default=Level.INFO)
	message = models.TextField(blank=True)
	meta = models.JSONField(default=dict, blank=True)

	class Meta:
		ordering = ["-created_at", "-id"]

	def __str__(self) -> str:
		return f"ReportJobEvent({self.id}) {self.event_type}"
