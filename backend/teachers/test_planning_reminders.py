from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from academic.models import (
    AcademicLevel,
    AcademicLoad,
    AcademicYear,
    Achievement,
    Area,
    Grade,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)
from notifications.models import Notification
from reports.models import PeriodicJobRuntimeConfig
from users.models import User


@patch.dict("os.environ", {"KAMPUS_NOTIFICATIONS_EMAIL_ENABLED": "false"}, clear=False)
class PlanningReminderCommandTests(TestCase):
    def setUp(self):
        now = timezone.now().date()

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="Periodo 1",
            start_date=now - timedelta(days=5),
            end_date=now + timedelta(days=5),
            planning_edit_until=timezone.now() + timedelta(days=2),
            is_closed=False,
        )

        self.teacher_missing = User.objects.create_user(
            username="teacher_missing",
            password="pwd",
            email="missing@example.com",
            role=User.ROLE_TEACHER,
        )
        self.teacher_incomplete = User.objects.create_user(
            username="teacher_incomplete",
            password="pwd",
            email="incomplete@example.com",
            role=User.ROLE_TEACHER,
        )

        level = AcademicLevel.objects.create(name="Secundaria", level_type="SECONDARY")
        area = Area.objects.create(name="Ciencias")

        grade_9 = Grade.objects.create(name="9", level=level, ordinal=9)
        grade_10 = Grade.objects.create(name="10", level=level, ordinal=10)
        grade_11 = Grade.objects.create(name="11", level=level, ordinal=11)

        group_a = Group.objects.create(name="A", grade=grade_9, academic_year=self.year, director=self.teacher_missing)
        group_b = Group.objects.create(name="B", grade=grade_10, academic_year=self.year, director=self.teacher_incomplete)
        group_c = Group.objects.create(name="C", grade=grade_11, academic_year=self.year, director=self.teacher_missing)

        subject_math = Subject.objects.create(name="Matematicas", area=area)
        subject_bio = Subject.objects.create(name="Biologia", area=area)
        subject_quim = Subject.objects.create(name="Quimica", area=area)

        load_math_9 = AcademicLoad.objects.create(subject=subject_math, grade=grade_9)
        load_bio_10 = AcademicLoad.objects.create(subject=subject_bio, grade=grade_10)
        load_quim_11 = AcademicLoad.objects.create(subject=subject_quim, grade=grade_11)

        # teacher_missing: 1/1 assignments with no planning -> 0%
        TeacherAssignment.objects.create(
            teacher=self.teacher_missing,
            academic_load=load_quim_11,
            group=group_c,
            academic_year=self.year,
        )

        # teacher_incomplete: 2 assignments, only 1 with planning -> <100%
        TeacherAssignment.objects.create(
            teacher=self.teacher_incomplete,
            academic_load=load_math_9,
            group=group_a,
            academic_year=self.year,
        )
        TeacherAssignment.objects.create(
            teacher=self.teacher_incomplete,
            academic_load=load_bio_10,
            group=group_b,
            academic_year=self.year,
        )

        Achievement.objects.create(
            academic_load=load_math_9,
            group=group_a,
            period=self.period,
            description="Logro periodo actual",
            percentage=50,
        )

    def test_creates_missing_and_incomplete_notifications(self):
        call_command("notify_pending_planning_teachers")

        missing_qs = Notification.objects.filter(
            recipient=self.teacher_missing,
            type="PLANNING_REMINDER_MISSING",
        )
        incomplete_qs = Notification.objects.filter(
            recipient=self.teacher_incomplete,
            type="PLANNING_REMINDER_INCOMPLETE",
        )

        self.assertEqual(missing_qs.count(), 1)
        self.assertEqual(incomplete_qs.count(), 1)
        self.assertIn("fecha de cierre", missing_qs.first().body.lower())
        self.assertIn("fecha de cierre", incomplete_qs.first().body.lower())

    def test_dedupe_prevents_second_notification_same_day(self):
        call_command("notify_pending_planning_teachers")
        call_command("notify_pending_planning_teachers")

        self.assertEqual(
            Notification.objects.filter(type="PLANNING_REMINDER_MISSING", recipient=self.teacher_missing).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(type="PLANNING_REMINDER_INCOMPLETE", recipient=self.teacher_incomplete).count(),
            1,
        )

    def test_dry_run_creates_no_notifications(self):
        call_command("notify_pending_planning_teachers", "--dry-run")
        self.assertEqual(Notification.objects.count(), 0)

    def test_runtime_dedupe_override_zero_allows_second_run_same_day(self):
        PeriodicJobRuntimeConfig.objects.create(
            job_key="notify-pending-planning-teachers",
            params_override={"dedupe_within_seconds": 0},
        )

        call_command("notify_pending_planning_teachers")
        call_command("notify_pending_planning_teachers")

        self.assertEqual(
            Notification.objects.filter(type="PLANNING_REMINDER_MISSING", recipient=self.teacher_missing).count(),
            2,
        )
        self.assertEqual(
            Notification.objects.filter(type="PLANNING_REMINDER_INCOMPLETE", recipient=self.teacher_incomplete).count(),
            2,
        )
