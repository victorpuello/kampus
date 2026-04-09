from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from academic.models import AcademicYear, Grade, Group, Period
from students.models import ConditionalPromotionPlan, Enrollment, Student


class PeriodActionsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.admin = User.objects.create_user(
            username="admin_periods",
            password="pass",
            role=User.ROLE_ADMIN,
            first_name="Admin",
            last_name="Periodos",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save(update_fields=["is_staff", "is_superuser"])

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=False,
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_can_close_and_reopen_period(self):
        close_resp = self.client.post(f"/api/periods/{self.period.id}/close/", {}, format="json")
        self.assertEqual(close_resp.status_code, 200, close_resp.data)
        self.period.refresh_from_db()
        self.assertTrue(self.period.is_closed)

        reopen_resp = self.client.post(f"/api/periods/{self.period.id}/reopen/", {}, format="json")
        self.assertEqual(reopen_resp.status_code, 200, reopen_resp.data)
        self.period.refresh_from_db()
        self.assertFalse(self.period.is_closed)


class CloseExpiredPeriodsCommandTests(TestCase):
    def setUp(self):
        User = get_user_model()

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.grade = Grade.objects.create(name="Sexto", ordinal=6)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year)

        student_user = User.objects.create_user(
            username="student_periods",
            password="pass",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Periodos",
        )
        self.student = Student.objects.create(user=student_user)
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        self.expired_period = Period.objects.create(
            academic_year=self.year,
            name="Primer Periodo",
            start_date=timezone.localdate() - timedelta(days=60),
            end_date=timezone.localdate() - timedelta(days=30),
            grades_edit_until=timezone.now() - timedelta(minutes=10),
            is_closed=False,
        )
        self.blocked_period = Period.objects.create(
            academic_year=self.year,
            name="Segundo Periodo",
            start_date=timezone.localdate() - timedelta(days=30),
            end_date=timezone.localdate() - timedelta(days=1),
            grades_edit_until=timezone.now() - timedelta(minutes=5),
            is_closed=False,
        )
        self.future_deadline_period = Period.objects.create(
            academic_year=self.year,
            name="Tercer Periodo",
            start_date=timezone.localdate(),
            end_date=timezone.localdate() + timedelta(days=30),
            grades_edit_until=timezone.now() + timedelta(days=1),
            is_closed=False,
        )

        ConditionalPromotionPlan.objects.create(
            enrollment=self.enrollment,
            due_period=self.blocked_period,
            status=ConditionalPromotionPlan.STATUS_OPEN,
        )

    def test_close_expired_periods_closes_only_unblocked_periods(self):
        stdout = StringIO()

        call_command("close_expired_periods", stdout=stdout)

        self.expired_period.refresh_from_db()
        self.blocked_period.refresh_from_db()
        self.future_deadline_period.refresh_from_db()

        self.assertTrue(self.expired_period.is_closed)
        self.assertFalse(self.blocked_period.is_closed)
        self.assertFalse(self.future_deadline_period.is_closed)
        self.assertIn("Periodos cerrados automaticamente: 1. Omitidos: 1.", stdout.getvalue())

    def test_close_expired_periods_dry_run_does_not_modify_data(self):
        stdout = StringIO()

        call_command("close_expired_periods", "--dry-run", stdout=stdout)

        self.expired_period.refresh_from_db()
        self.assertFalse(self.expired_period.is_closed)
        self.assertIn("[dry-run] Periodos candidatos a cierre: 2", stdout.getvalue())