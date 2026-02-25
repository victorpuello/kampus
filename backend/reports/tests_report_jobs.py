from __future__ import annotations

import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from academic.models import AcademicYear, Grade, Group
from reports.models import ReportJob
from students.models import Enrollment, FamilyMember, Student


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
def test_create_report_job_and_generate_pdf(db):
    User = get_user_model()
    user = User.objects.create_user(username="u1", password="p1", role=User.ROLE_ADMIN)

    with tempfile.TemporaryDirectory() as tmp:
        private_root = Path(tmp)
        with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
            client = APIClient()
            assert client.login(username="u1", password="p1")

            res = client.post(
                "/api/reports/jobs/",
                {"report_type": "DUMMY", "params": {"hello": "world"}},
                format="json",
            )
            assert res.status_code == 202
            job_id = res.data["id"]

            job = ReportJob.objects.get(id=job_id)
            assert job.status == ReportJob.Status.SUCCEEDED
            assert job.output_relpath

            download = client.get(f"/api/reports/jobs/{job_id}/download/")
            assert download.status_code == 200
            assert download["Content-Type"].startswith("application/pdf")


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
def test_create_family_directory_report_job_and_generate_pdf(db):
    User = get_user_model()
    user = User.objects.create_user(username="u_family", password="p1", role=User.ROLE_ADMIN)

    year = AcademicYear.objects.create(year="2026", status="ACTIVE")
    grade = Grade.objects.create(name="1", ordinal=1)
    group = Group.objects.create(name="A", grade=grade, academic_year=year, capacity=35)

    student_user = User.objects.create_user(
        username="student_family_pdf",
        password="p1",
        first_name="Ana",
        last_name="Pérez",
        role=User.ROLE_STUDENT,
    )
    student = Student.objects.create(user=student_user, document_number="100200300")
    Enrollment.objects.create(
        student=student,
        academic_year=year,
        grade=grade,
        group=group,
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

    with tempfile.TemporaryDirectory() as tmp:
        private_root = Path(tmp)
        with override_settings(PRIVATE_STORAGE_ROOT=private_root, PRIVATE_REPORTS_DIR="reports"):
            client = APIClient()
            assert client.login(username="u_family", password="p1")

            res = client.post(
                "/api/reports/jobs/",
                {"report_type": "FAMILY_DIRECTORY_BY_GROUP", "params": {}},
                format="json",
            )
            assert res.status_code == 202
            job_id = res.data["id"]

            job = ReportJob.objects.get(id=job_id)
            assert job.status == ReportJob.Status.SUCCEEDED
            assert job.output_relpath
            assert job.output_filename == "directorio_padres_por_grado_grupo.pdf"

            download = client.get(f"/api/reports/jobs/{job_id}/download/")
            assert download.status_code == 200
            assert download["Content-Type"].startswith("application/pdf")
