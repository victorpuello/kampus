import tempfile
from pathlib import Path
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import PeriodicJobRun, ReportJob
from .weasyprint_utils import WeasyPrintUnavailableError


class ReportJobVerificationTests(APITestCase):
	def test_preview_study_certification_creates_verifiable_document(self):
		from academic.models import AcademicYear, Grade  # noqa: PLC0415
		from students.models import Student, Enrollment  # noqa: PLC0415
		from verification.models import VerifiableDocument  # noqa: PLC0415

		User = get_user_model()
		admin = User.objects.create_user(username="admin_verify_cert", password="p1", role=User.ROLE_ADMIN)
		student_user = User.objects.create_user(
			username="student_verify_cert",
			password="p2",
			role=User.ROLE_STUDENT,
			first_name="Ana",
			last_name="Pérez",
		)
		student = Student.objects.create(user=student_user, document_type="TI", document_number="DOC-VERIFY-1")

		ay = AcademicYear.objects.create(year=2098, status=AcademicYear.STATUS_ACTIVE)
		grade = Grade.objects.create(name="5")
		enrollment = Enrollment.objects.create(student=student, academic_year=ay, grade=grade, status="ACTIVE")

		self.client.force_authenticate(user=admin)
		job = ReportJob.objects.create(
			created_by=admin,
			report_type=ReportJob.ReportType.STUDY_CERTIFICATION,
			params={"enrollment_id": enrollment.id},
			status=ReportJob.Status.PENDING,
		)

		self.assertFalse(
			VerifiableDocument.objects.filter(
				doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATION,
				object_type="ReportJob",
				object_id=str(job.id),
			).exists()
		)

		res = self.client.get(f"/api/reports/jobs/{job.id}/preview/")
		self.assertEqual(res.status_code, 200, res.content.decode("utf-8", errors="ignore"))
		html = res.content.decode("utf-8", errors="ignore")
		self.assertIn("Verificación:", html)
		self.assertIn("/api/public/verify/", html)

		self.assertTrue(
			VerifiableDocument.objects.filter(
				doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATION,
				object_type="ReportJob",
				object_id=str(job.id),
			).exists()
		)

	def test_preview_academic_period_report_creates_verifiable_document(self):
		from academic.models import AcademicYear, Grade, Period  # noqa: PLC0415
		from students.models import Student, Enrollment  # noqa: PLC0415
		from verification.models import VerifiableDocument  # noqa: PLC0415

		User = get_user_model()
		admin = User.objects.create_user(username="admin_verify_report", password="p1", role=User.ROLE_ADMIN)
		student_user = User.objects.create_user(
			username="student_verify_report",
			password="p2",
			role=User.ROLE_STUDENT,
			first_name="Luis",
			last_name="Gómez",
		)
		student = Student.objects.create(user=student_user, document_type="TI", document_number="DOC-VERIFY-2")

		ay = AcademicYear.objects.create(year=2097, status=AcademicYear.STATUS_ACTIVE)
		period = Period.objects.create(
			academic_year=ay,
			name="1",
			start_date="2097-01-01",
			end_date="2097-03-31",
		)
		grade = Grade.objects.create(name="6")
		enrollment = Enrollment.objects.create(student=student, academic_year=ay, grade=grade, status="ACTIVE")

		self.client.force_authenticate(user=admin)
		job = ReportJob.objects.create(
			created_by=admin,
			report_type=ReportJob.ReportType.ACADEMIC_PERIOD_ENROLLMENT,
			params={"enrollment_id": enrollment.id, "period_id": period.id},
			status=ReportJob.Status.PENDING,
		)

		res = self.client.get(f"/api/reports/jobs/{job.id}/preview/")
		self.assertEqual(res.status_code, 200, res.content.decode("utf-8", errors="ignore"))
		html = res.content.decode("utf-8", errors="ignore")
		self.assertIn("Verificación:", html)
		self.assertIn("/api/public/verify/", html)

		self.assertTrue(
			VerifiableDocument.objects.filter(
				doc_type=VerifiableDocument.DocType.REPORT_CARD,
				object_type="ReportJob",
				object_id=str(job.id),
			).exists()
		)

	def test_preview_observer_report_creates_verifiable_document(self):
		from students.models import Student  # noqa: PLC0415
		from verification.models import VerifiableDocument  # noqa: PLC0415
		from core.models import Institution  # noqa: PLC0415

		User = get_user_model()
		admin = User.objects.create_user(username="admin_verify_observer", password="p1", role=User.ROLE_ADMIN)
		student_user = User.objects.create_user(
			username="student_verify_observer",
			password="p2",
			role=User.ROLE_STUDENT,
			first_name="María",
			last_name="López",
		)
		student = Student.objects.create(user=student_user, document_type="TI", document_number="DOC-VERIFY-OBS")
		Institution.objects.create(name="IE Test")

		self.client.force_authenticate(user=admin)
		job = ReportJob.objects.create(
			created_by=admin,
			report_type=ReportJob.ReportType.OBSERVER_REPORT,
			params={"student_id": student.pk},
			status=ReportJob.Status.PENDING,
		)

		self.assertFalse(
			VerifiableDocument.objects.filter(
				doc_type=VerifiableDocument.DocType.OBSERVER_REPORT,
				object_type="ReportJob",
				object_id=str(job.id),
			).exists()
		)

		res = self.client.get(f"/api/reports/jobs/{job.id}/preview/")
		self.assertEqual(res.status_code, 200)
		html = res.content.decode("utf-8", errors="ignore")
		self.assertIn("Verificación:", html)
		self.assertIn("/api/public/verify/", html)

		self.assertTrue(
			VerifiableDocument.objects.filter(
				doc_type=VerifiableDocument.DocType.OBSERVER_REPORT,
				object_type="ReportJob",
				object_id=str(job.id),
			).exists()
		)


class ReportJobApiTests(APITestCase):
	def test_operations_overview_requires_superadmin(self):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_ops_overview", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.get("/api/reports/operations/jobs/overview/")
		self.assertEqual(res.status_code, 403)

	def test_operations_overview_returns_data_for_superadmin(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_overview", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.get("/api/reports/operations/jobs/overview/")
		self.assertEqual(res.status_code, 200)
		self.assertIn("report_jobs", res.data)
		self.assertIn("periodic_jobs", res.data)
		self.assertIn("latest_runs", res.data)

	@patch.dict("reports.views.OperationsRunNowAPIView.TASK_DISPATCH", clear=True)
	def test_operations_run_now_dispatches_for_superadmin(self):
		from reports.views import OperationsRunNowAPIView  # noqa: PLC0415

		mock_result = MagicMock()
		mock_result.id = "task-123"
		mock_task = MagicMock()
		mock_task.delay.return_value = mock_result
		mock_task.name = "novelties.notify_novelties_sla"
		OperationsRunNowAPIView.TASK_DISPATCH["notify-novelties-sla"] = mock_task

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_run_now", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/run-now/",
			{"job_key": "notify-novelties-sla"},
			format="json",
		)
		self.assertEqual(res.status_code, 202)
		self.assertTrue(res.data.get("dispatched"))
		self.assertEqual(res.data.get("task_id"), "task-123")
		run_id = res.data.get("run_id")
		self.assertIsNotNone(run_id)
		run = PeriodicJobRun.objects.get(id=run_id)
		self.assertEqual(run.job_key, "notify-novelties-sla")
		self.assertEqual(run.status, PeriodicJobRun.Status.PENDING)
		mock_task.delay.assert_called_once_with(periodic_run_id=run.id)

	def test_operations_run_now_rejects_unknown_job_key(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_badkey", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/run-now/",
			{"job_key": "unknown-job"},
			format="json",
		)
		self.assertEqual(res.status_code, 400)
		self.assertIn("supported_job_keys", res.data)

	@patch.dict("reports.views.OperationsRunNowAPIView.TASK_DISPATCH", clear=True)
	def test_operations_run_now_rejects_when_job_is_paused(self):
		from reports.models import PeriodicJobRuntimeConfig  # noqa: PLC0415
		from reports.views import OperationsRunNowAPIView  # noqa: PLC0415

		mock_result = MagicMock()
		mock_result.id = "task-456"
		mock_task = MagicMock()
		mock_task.delay.return_value = mock_result
		mock_task.name = "novelties.notify_novelties_sla"
		OperationsRunNowAPIView.TASK_DISPATCH["notify-novelties-sla"] = mock_task

		PeriodicJobRuntimeConfig.objects.create(job_key="notify-novelties-sla", enabled_override=False)

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_paused", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/run-now/",
			{"job_key": "notify-novelties-sla"},
			format="json",
		)
		self.assertEqual(res.status_code, 409)
		mock_task.delay.assert_not_called()

	def test_operations_toggle_updates_job_runtime_override(self):
		from reports.models import PeriodicJobRuntimeConfig  # noqa: PLC0415

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_toggle", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/toggle/",
			{"job_key": "notify-novelties-sla", "enabled": False},
			format="json",
		)
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data.get("job_key"), "notify-novelties-sla")
		self.assertFalse(res.data.get("enabled"))

		obj = PeriodicJobRuntimeConfig.objects.get(job_key="notify-novelties-sla")
		self.assertFalse(obj.enabled_override)

	def test_operations_toggle_requires_superadmin(self):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_ops_toggle", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.post(
			"/api/reports/operations/jobs/toggle/",
			{"job_key": "notify-novelties-sla", "enabled": False},
			format="json",
		)
		self.assertEqual(res.status_code, 403)

	def test_operations_params_updates_runtime_override(self):
		from reports.models import PeriodicJobRuntimeConfig  # noqa: PLC0415

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_params", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/params/",
			{"job_key": "notify-pending-planning-teachers", "params": {"dedupe_within_seconds": 120}},
			format="json",
		)
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data.get("job_key"), "notify-pending-planning-teachers")
		self.assertEqual(res.data.get("params_override", {}).get("dedupe_within_seconds"), 120)

		cfg = PeriodicJobRuntimeConfig.objects.get(job_key="notify-pending-planning-teachers")
		self.assertEqual((cfg.params_override or {}).get("dedupe_within_seconds"), 120)

	def test_operations_params_rejects_invalid_value(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_params_bad", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/params/",
			{"job_key": "notify-pending-planning-teachers", "params": {"dedupe_within_seconds": -1}},
			format="json",
		)
		self.assertEqual(res.status_code, 400)

	def test_operations_params_requires_superadmin(self):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_ops_params", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.post(
			"/api/reports/operations/jobs/params/",
			{"job_key": "notify-pending-planning-teachers", "params": {"dedupe_within_seconds": 120}},
			format="json",
		)
		self.assertEqual(res.status_code, 403)

	def test_operations_params_updates_notifications_health_thresholds(self):
		from reports.models import PeriodicJobRuntimeConfig  # noqa: PLC0415

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_params_health", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/params/",
			{
				"job_key": "check-notifications-health",
				"params": {"max_failed": 7, "max_suppressed": 31},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data.get("params_override", {}).get("max_failed"), 7)
		self.assertEqual(res.data.get("params_override", {}).get("max_suppressed"), 31)

		cfg = PeriodicJobRuntimeConfig.objects.get(job_key="check-notifications-health")
		self.assertEqual((cfg.params_override or {}).get("max_failed"), 7)
		self.assertEqual((cfg.params_override or {}).get("max_suppressed"), 31)

	def test_operations_schedule_updates_runtime_override(self):
		from reports.models import PeriodicJobRuntimeConfig  # noqa: PLC0415

		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_schedule", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/schedule/",
			{
				"job_key": "notify-pending-planning-teachers",
				"schedule": {"minute": "5", "hour": "6", "day_of_week": "1-5"},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 200)
		self.assertTrue(res.data.get("scheduler_restart_required"))

		cfg = PeriodicJobRuntimeConfig.objects.get(job_key="notify-pending-planning-teachers")
		self.assertEqual((cfg.schedule_override or {}).get("minute"), "5")
		self.assertEqual((cfg.schedule_override or {}).get("hour"), "6")
		self.assertEqual((cfg.schedule_override or {}).get("day_of_week"), "1-5")

	def test_operations_schedule_requires_superadmin(self):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_ops_schedule", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.post(
			"/api/reports/operations/jobs/schedule/",
			{
				"job_key": "notify-pending-planning-teachers",
				"schedule": {"minute": "5", "hour": "6", "day_of_week": "1-5"},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 403)

	def test_operations_schedule_rejects_invalid_minute(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_schedule_min", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/schedule/",
			{
				"job_key": "notify-pending-planning-teachers",
				"schedule": {"minute": "99", "hour": "6", "day_of_week": "1-5"},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 400)
		self.assertIn("schedule.minute", str(res.data.get("detail", "")))

	def test_operations_schedule_rejects_invalid_hour(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_schedule_hour", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/schedule/",
			{
				"job_key": "notify-pending-planning-teachers",
				"schedule": {"minute": "5", "hour": "44", "day_of_week": "1-5"},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 400)
		self.assertIn("schedule.hour", str(res.data.get("detail", "")))

	def test_operations_schedule_rejects_invalid_day_of_week(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_schedule_dow", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		res = self.client.post(
			"/api/reports/operations/jobs/schedule/",
			{
				"job_key": "notify-pending-planning-teachers",
				"schedule": {"minute": "5", "hour": "6", "day_of_week": "9"},
			},
			format="json",
		)
		self.assertEqual(res.status_code, 400)
		self.assertIn("schedule.day_of_week", str(res.data.get("detail", "")))

	def test_operations_run_logs_requires_superadmin(self):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_ops_run_logs", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		job = ReportJob.objects.create(
			created_by=admin,
			report_type=ReportJob.ReportType.DUMMY,
			params={},
			status=ReportJob.Status.FAILED,
			error_code="X",
			error_message="fallo prueba",
		)
		job.add_event(event_type="FAILED", level="ERROR", message="fallo prueba")

		res = self.client.get(f"/api/reports/operations/jobs/runs/{job.id}/logs/")
		self.assertEqual(res.status_code, 403)

	def test_operations_run_logs_returns_events_for_superadmin(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_run_logs", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		job = ReportJob.objects.create(
			created_by=superadmin,
			report_type=ReportJob.ReportType.DUMMY,
			params={},
			status=ReportJob.Status.FAILED,
			error_code="X",
			error_message="fallo prueba",
		)
		job.add_event(event_type="RUNNING", level="INFO", message="inicio")
		job.add_event(event_type="FAILED", level="ERROR", message="fallo prueba")

		res = self.client.get(f"/api/reports/operations/jobs/runs/{job.id}/logs/")
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data.get("run", {}).get("id"), job.id)
		self.assertEqual(res.data.get("run", {}).get("status"), ReportJob.Status.FAILED)
		self.assertGreaterEqual(len(res.data.get("events", [])), 2)

	def test_operations_periodic_run_logs_returns_payload_for_superadmin(self):
		User = get_user_model()
		superadmin = User.objects.create_user(username="superadmin_ops_periodic_logs", password="p1", role=User.ROLE_SUPERADMIN)
		self.client.force_authenticate(user=superadmin)

		run = PeriodicJobRun.objects.create(
			job_key="notify-pending-planning-teachers",
			task_name="teachers.notify_pending_planning_teachers",
			triggered_by=superadmin,
			status=PeriodicJobRun.Status.SUCCEEDED,
			output_text="ok",
		)

		res = self.client.get(f"/api/reports/operations/jobs/periodic-runs/{run.id}/logs/")
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data.get("run", {}).get("id"), run.id)
		self.assertEqual(res.data.get("run", {}).get("status"), PeriodicJobRun.Status.SUCCEEDED)
		self.assertGreaterEqual(len(res.data.get("events", [])), 1)

	def test_pdf_healthcheck_requires_authentication(self):
		res = self.client.get("/api/reports/health/pdf/")
		self.assertEqual(res.status_code, 401)

	def test_pdf_healthcheck_requires_admin_role(self):
		User = get_user_model()
		teacher = User.objects.create_user(username="teacher_pdf_health", password="p1", role=User.ROLE_TEACHER)
		self.client.force_authenticate(user=teacher)

		res = self.client.get("/api/reports/health/pdf/")
		self.assertEqual(res.status_code, 403)

	@patch("reports.views.render_pdf_bytes_from_html", return_value=b"%PDF-1.4\n")
	def test_pdf_healthcheck_returns_ok_for_admin(self, _mock_render):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_pdf_health_ok", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.get("/api/reports/health/pdf/")
		self.assertEqual(res.status_code, 200)
		self.assertTrue(res.data.get("ok"))
		self.assertEqual(res.data.get("service"), "pdf_render")

	@patch("reports.views.render_pdf_bytes_from_html", side_effect=WeasyPrintUnavailableError("not available"))
	def test_pdf_healthcheck_returns_503_when_weasyprint_unavailable(self, _mock_render):
		User = get_user_model()
		admin = User.objects.create_user(username="admin_pdf_health_503", password="p1", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=admin)

		res = self.client.get("/api/reports/health/pdf/")
		self.assertEqual(res.status_code, 503)
		self.assertFalse(res.data.get("ok"))

	def test_preview_html_endpoint(self):
		User = get_user_model()
		user = User.objects.create_user(username="u2", password="p2", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=user)

		job = ReportJob.objects.create(
			created_by=user,
			report_type=ReportJob.ReportType.DUMMY,
			params={"hello": "preview"},
			status=ReportJob.Status.PENDING,
		)

		res = self.client.get(f"/api/reports/jobs/{job.id}/preview/")
		self.assertEqual(res.status_code, 200)
		self.assertTrue(res["Content-Type"].startswith("text/html"))
		self.assertIn("Reporte", res.content.decode("utf-8", errors="ignore"))

	@override_settings(
		CELERY_TASK_ALWAYS_EAGER=True,
		CELERY_TASK_EAGER_PROPAGATES=True,
	)
	def test_create_report_job_and_download_pdf(self):
		# WeasyPrint on Windows local venv may fail due to missing native libs.
		# In Docker it should work (Dockerfile installs required deps).
		try:
			from weasyprint import HTML  # noqa: F401
		except Exception:
			self.skipTest("WeasyPrint no disponible en este entorno")

		User = get_user_model()
		user = User.objects.create_user(username="u1", password="p1", role=User.ROLE_ADMIN)

		with tempfile.TemporaryDirectory() as tmp:
			private_root = Path(tmp)
			with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
				self.client.force_authenticate(user=user)

				res = self.client.post(
					"/api/reports/jobs/",
					{"report_type": "DUMMY", "params": {"hello": "world"}},
					format="json",
				)
				self.assertEqual(res.status_code, 202)
				job_id = res.data["id"]

				job = ReportJob.objects.get(id=job_id)
				self.assertEqual(job.status, ReportJob.Status.SUCCEEDED)
				self.assertTrue(job.output_relpath)

				download = self.client.get(f"/api/reports/jobs/{job_id}/download/")
				self.assertEqual(download.status_code, 200)
				self.assertTrue(download["Content-Type"].startswith("application/pdf"))

	@override_settings(
		CELERY_TASK_ALWAYS_EAGER=True,
		CELERY_TASK_EAGER_PROPAGATES=True,
	)
	def test_create_study_certification_and_download_pdf(self):
		# WeasyPrint on Windows local venv may fail due to missing native libs.
		# In Docker it should work (Dockerfile installs required deps).
		try:
			from weasyprint import HTML  # noqa: F401
		except Exception:
			self.skipTest("WeasyPrint no disponible en este entorno")

		from academic.models import AcademicYear, Grade  # noqa: PLC0415
		from students.models import Student, Enrollment  # noqa: PLC0415

		User = get_user_model()
		admin = User.objects.create_user(username="admin_study_cert", password="p1", role=User.ROLE_ADMIN)
		student_user = User.objects.create_user(
			username="student_study_cert",
			password="p2",
			role=User.ROLE_STUDENT,
			first_name="Juan",
			last_name="Pérez",
		)
		student = Student.objects.create(user=student_user, document_type="TI", document_number="DOC-STUDY-CERT-1")

		ay = AcademicYear.objects.create(year=2099, status=AcademicYear.STATUS_ACTIVE)
		grade = Grade.objects.create(name="5")
		enrollment = Enrollment.objects.create(student=student, academic_year=ay, grade=grade, status="ACTIVE")

		with tempfile.TemporaryDirectory() as tmp:
			private_root = Path(tmp)
			with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
				self.client.force_authenticate(user=admin)

				res = self.client.post(
					"/api/reports/jobs/",
					{"report_type": "STUDY_CERTIFICATION", "params": {"enrollment_id": enrollment.id}},
					format="json",
				)
				self.assertEqual(res.status_code, 202)
				job_id = res.data["id"]

				job = ReportJob.objects.get(id=job_id)
				self.assertEqual(job.status, ReportJob.Status.SUCCEEDED)
				self.assertTrue(job.output_relpath)

				download = self.client.get(f"/api/reports/jobs/{job_id}/download/")
				self.assertEqual(download.status_code, 200)
				self.assertTrue(download["Content-Type"].startswith("application/pdf"))

	def test_cancel_running_job(self):
		User = get_user_model()
		user = User.objects.create_user(username="u2", password="p2", role=User.ROLE_ADMIN)
		self.client.force_authenticate(user=user)

		job = ReportJob.objects.create(
			created_by=user,
			report_type=ReportJob.ReportType.DUMMY,
			params={},
			status=ReportJob.Status.RUNNING,
			started_at=timezone.now(),
		)

		res = self.client.post(f"/api/reports/jobs/{job.id}/cancel/")
		self.assertEqual(res.status_code, 200)
		job.refresh_from_db()
		self.assertEqual(job.status, ReportJob.Status.CANCELED)

	def test_cleanup_report_jobs_deletes_expired_file(self):
		User = get_user_model()
		user = User.objects.create_user(username="u3", password="p3", role=User.ROLE_ADMIN)

		with tempfile.TemporaryDirectory() as tmp:
			private_root = Path(tmp)
			reports_dir = private_root / "reports"
			reports_dir.mkdir(parents=True, exist_ok=True)
			fake_rel = "reports/to_delete.pdf"
			(fake_path := (reports_dir / "to_delete.pdf")).write_bytes(b"%PDF-1.4\n%fake\n")

			job = ReportJob.objects.create(
				created_by=user,
				report_type=ReportJob.ReportType.DUMMY,
				params={},
				status=ReportJob.Status.SUCCEEDED,
				output_relpath=fake_rel,
				output_filename="to_delete.pdf",
				expires_at=timezone.now() - timedelta(hours=1),
			)

			with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
				call_command("cleanup_report_jobs")

			self.assertFalse(fake_path.exists())
			self.assertFalse(ReportJob.objects.filter(id=job.id).exists())

# Create your tests here.
