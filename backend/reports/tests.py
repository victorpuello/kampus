import tempfile
from pathlib import Path
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import ReportJob


class ReportJobApiTests(APITestCase):
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
