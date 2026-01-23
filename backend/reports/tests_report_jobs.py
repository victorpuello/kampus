from __future__ import annotations

import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from reports.models import ReportJob


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
