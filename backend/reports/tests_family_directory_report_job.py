from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from academic.models import AcademicYear, Grade, Group
from reports.models import ReportJob
from reports.tasks import _render_report_html
from students.models import Enrollment, FamilyMember, Student


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class FamilyDirectoryReportJobAPITest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="u_family_report_job",
            password="p1",
            role=User.ROLE_ADMIN,
        )
        self.client.force_authenticate(user=self.user)

        self.year = AcademicYear.objects.create(year="2026", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=35)

        student_user = User.objects.create_user(
            username="student_family_pdf_job",
            password="p1",
            first_name="Ana",
            last_name="Pérez",
            role=User.ROLE_STUDENT,
        )
        student = Student.objects.create(user=student_user, document_number="100200300")

        Enrollment.objects.create(
            student=student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )
        FamilyMember.objects.create(
            student=student,
            full_name="Carlos Pérez",
            document_number="CC12345",
            relationship="Padre",
            phone="3001112233",
            address="Calle 1 # 2-3",
            is_main_guardian=True,
        )

    def test_create_family_directory_report_job_and_render_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            private_root = Path(tmp)
            with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
                with patch("reports.views.generate_report_job_pdf.delay", return_value=None):
                    res = self.client.post(
                        "/api/reports/jobs/",
                        {"report_type": "FAMILY_DIRECTORY_BY_GROUP", "params": {}},
                        format="json",
                    )
                self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
                job_id = res.data["id"]

                job = ReportJob.objects.get(id=job_id)
                self.assertEqual(job.status, ReportJob.Status.PENDING)
                self.assertEqual(job.report_type, ReportJob.ReportType.FAMILY_DIRECTORY_BY_GROUP)

                html = _render_report_html(job)
                self.assertIn("DIRECTORIO DE PADRES DE FAMILIA", html)
                self.assertIn("Pérez Ana", html)
                self.assertIn("Carlos Pérez", html)
