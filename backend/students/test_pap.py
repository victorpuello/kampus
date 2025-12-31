from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academic.models import AcademicLevel, AcademicYear, Grade, Period
from students.models import ConditionalPromotionPlan, Enrollment, Student


class PapWorkflowTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username="superadmin",
            email="sa@example.com",
            password="pass",
            role=User.ROLE_SUPERADMIN,
        )

        student_user = User.objects.create_user(
            username="student1",
            password="pass",
            email="s1@example.com",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Uno",
        )
        self.student = Student.objects.create(user=student_user)

        level = AcademicLevel.objects.create(name="Secundaria", level_type="SECONDARY")
        self.grade_8 = Grade.objects.create(name="Octavo", level=level, ordinal=10)
        self.grade_9 = Grade.objects.create(name="Noveno", level=level, ordinal=11)

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period1 = Period.objects.create(
            academic_year=self.year,
            name="Periodo 1",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 3, 31),
            is_closed=False,
        )

        self.client.force_authenticate(user=self.admin)

    def test_period_close_blocked_by_open_pap_then_allows_after_cleared(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade_9,
            group=None,
            status="ACTIVE",
        )
        source = Enrollment.objects.create(
            student=self.student,
            academic_year=AcademicYear.objects.create(year=2024, status=AcademicYear.STATUS_CLOSED),
            grade=self.grade_8,
            group=None,
            status="RETIRED",
        )
        ConditionalPromotionPlan.objects.create(
            enrollment=enrollment,
            source_enrollment=source,
            due_period=self.period1,
            pending_subject_ids=[1, 2],
            pending_area_ids=[10],
            status=ConditionalPromotionPlan.STATUS_OPEN,
        )

        close_resp = self.client.post(f"/api/periods/{self.period1.id}/close/")
        self.assertEqual(close_resp.status_code, 400)
        self.assertEqual(close_resp.data["pending_pap_count"], 1)

        resolve_resp = self.client.post(
            f"/api/enrollments/{enrollment.id}/pap/resolve/",
            {"status": "CLEARED", "notes": "Cumplió el PAP"},
            format="json",
        )
        self.assertEqual(resolve_resp.status_code, 200)

        close_resp2 = self.client.post(f"/api/periods/{self.period1.id}/close/")
        self.assertEqual(close_resp2.status_code, 200)
        self.period1.refresh_from_db()
        self.assertTrue(self.period1.is_closed)

    def test_pap_failed_reverts_grade_to_source(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade_9,
            group=None,
            status="ACTIVE",
        )
        source = Enrollment.objects.create(
            student=self.student,
            academic_year=AcademicYear.objects.create(year=2024, status=AcademicYear.STATUS_CLOSED),
            grade=self.grade_8,
            group=None,
            status="RETIRED",
        )
        ConditionalPromotionPlan.objects.create(
            enrollment=enrollment,
            source_enrollment=source,
            due_period=self.period1,
            status=ConditionalPromotionPlan.STATUS_OPEN,
        )

        resp = self.client.post(
            f"/api/enrollments/{enrollment.id}/pap/resolve/",
            {"status": "FAILED", "notes": "No superó"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        enrollment.refresh_from_db()
        self.assertEqual(enrollment.grade_id, self.grade_8.id)
        self.assertIsNone(enrollment.group_id)
        self.assertEqual(enrollment.final_status, "PAP NO APROBADO (RETENIDO)")

    def test_pap_plans_list_endpoint(self):
        enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade_9,
            group=None,
            status="ACTIVE",
        )
        source = Enrollment.objects.create(
            student=self.student,
            academic_year=AcademicYear.objects.create(year=2024, status=AcademicYear.STATUS_CLOSED),
            grade=self.grade_8,
            group=None,
            status="RETIRED",
        )
        plan = ConditionalPromotionPlan.objects.create(
            enrollment=enrollment,
            source_enrollment=source,
            due_period=self.period1,
            status=ConditionalPromotionPlan.STATUS_OPEN,
        )

        resp = self.client.get(f"/api/enrollments/pap-plans/?status=OPEN&academic_year={self.year.id}")
        self.assertEqual(resp.status_code, 200)
        ids = [r["id"] for r in resp.data.get("results", [])]
        self.assertIn(plan.id, ids)
