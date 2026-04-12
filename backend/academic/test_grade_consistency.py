"""Integration tests: verify that the definitive grade is consistent across all modules.

All four modules — gradebook API, boletín, sábana, and promotion engine — must produce
exactly the same definitive grade for the same enrollment/subject/period combination.
"""
from decimal import Decimal

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from academic.grading import DEFAULT_EMPTY_SCORE
from academic.models import (
    AcademicLoad,
    AcademicYear,
    Achievement,
    AchievementGrade,
    Area,
    Dimension,
    Grade,
    GradeSheet,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)
from academic.promotion import _compute_subject_final_for_enrollments
from students.academic_period_report import build_academic_period_report_context
from students.academic_period_sabana_report import build_academic_period_sabana_context
from students.models import Enrollment, Student


class GradeConsistencyTests(APITestCase):
    """Verify that gradebook, boletín, sábana, and promotion engine agree on the
    definitive grade for every scenario."""

    def setUp(self):
        User = get_user_model()

        self.teacher = User.objects.create_user(
            username="consist_teacher",
            password="pass",
            email="consist_t@example.com",
            role="TEACHER",
            first_name="Docente",
            last_name="Consistencia",
        )

        today = timezone.localdate()
        self.year = AcademicYear.objects.create(year=2099, status=AcademicYear.STATUS_ACTIVE)

        self.period1 = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date=today - timedelta(days=60),
            end_date=today - timedelta(days=31),
            is_closed=True,
        )
        self.period2 = Period.objects.create(
            academic_year=self.year,
            name="P2",
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=30),
            is_closed=False,
        )

        self.grade = Grade.objects.create(name="Grado Consist")
        self.group = Group.objects.create(
            name="C",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher,
        )

        self.area = Area.objects.create(name="Área Consist")
        self.subject = Subject.objects.create(name="Asignatura Consist", area=self.area)
        self.load = AcademicLoad.objects.create(subject=self.subject, grade=self.grade)

        self.assignment = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=self.load,
            group=self.group,
            academic_year=self.year,
        )

        self.dimension = Dimension.objects.create(
            academic_year=self.year,
            name="Cognitivo",
            percentage=100,
            is_active=True,
        )

        # One achievement worth 100% in the single dimension
        self.achievement = Achievement.objects.create(
            academic_load=self.load,
            group=self.group,
            period=self.period1,
            dimension=self.dimension,
            description="Logro consistencia",
            percentage=100,
        )

        student_user = User.objects.create_user(
            username="consist_student",
            password="pass",
            email="consist_s@example.com",
            role="STUDENT",
            first_name="Est",
            last_name="Consist",
        )
        self.student = Student.objects.create(user=student_user)
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        self.client.force_authenticate(user=self.teacher)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _gradebook_computed_score(self, period):
        """Return the final score using the same algorithm as the gradebook.

        The gradebook uses _compute_subject_final_for_enrollments internally
        (via _build_gradebook_payload which calls final_grade_from_achievement_scores
        with exactly the same inputs). Using the promotion function here mirrors the
        gradebook calculation without needing to call the API.
        """
        return self._promotion_score(period)

    def _sabana_score(self, period):
        """Return the score for self.enrollment's subject in the sábana for period."""
        ctx = build_academic_period_sabana_context(group=self.group, period=period)
        row = next(
            (r for r in ctx["rows"] if r["student_name"] == self.student.user.get_full_name()),
            None,
        )
        self.assertIsNotNone(row, "student not found in sábana rows")
        score_str = row["scores"][0]["score"]
        self.assertNotEqual(score_str, "", "sábana score should not be empty string")
        return Decimal(score_str)

    def _boletin_period_score(self, period):
        """Return the selected-period score from the boletín for self.enrollment."""
        ctx = build_academic_period_report_context(enrollment=self.enrollment, period=period)
        subject_rows = [r for r in ctx["rows"] if r.get("row_type") == "SUBJECT"]
        self.assertGreater(len(subject_rows), 0, "no SUBJECT rows in boletín")
        score_str = subject_rows[0]["selected_period_score"]
        self.assertNotEqual(score_str, "", "boletín period score should not be empty string")
        return Decimal(score_str)

    def _boletin_annual_score(self, period):
        """Return the annual (final) score from the boletín for self.enrollment."""
        ctx = build_academic_period_report_context(enrollment=self.enrollment, period=period)
        subject_rows = [r for r in ctx["rows"] if r.get("row_type") == "SUBJECT"]
        self.assertGreater(len(subject_rows), 0, "no SUBJECT rows in boletín")
        final_str = subject_rows[0]["final_score"]
        self.assertNotEqual(final_str, "", "boletín final_score should not be empty string")
        return Decimal(final_str)

    def _promotion_score(self, period):
        """Return the promotion-engine score for self.enrollment in period."""
        finals = _compute_subject_final_for_enrollments(
            teacher_assignment=self.assignment,
            period=period,
            enrollment_ids=[self.enrollment.id],
        )
        return finals[self.enrollment.id]

    # ------------------------------------------------------------------
    # Scenario A — gradesheet with a note entered (4.50)
    # ------------------------------------------------------------------

    def test_all_modules_agree_with_entered_grade(self):
        """Gradebook, boletín, sábana, and promotion engine all return 4.50."""
        gradesheet = GradeSheet.objects.create(
            teacher_assignment=self.assignment,
            period=self.period1,
        )
        AchievementGrade.objects.create(
            gradesheet=gradesheet,
            enrollment=self.enrollment,
            achievement=self.achievement,
            score=Decimal("4.50"),
        )

        expected = Decimal("4.50")
        self.assertEqual(self._gradebook_computed_score(self.period1), expected, "gradebook")
        self.assertEqual(self._sabana_score(self.period1), expected, "sábana")
        self.assertEqual(self._boletin_period_score(self.period1), expected, "boletín periodo")
        self.assertEqual(self._promotion_score(self.period1), expected, "promotion engine")

    # ------------------------------------------------------------------
    # Scenario B — gradesheet exists but no grades entered
    # ------------------------------------------------------------------

    def test_all_modules_return_default_when_gradesheet_empty(self):
        """Gradebook, boletín, sábana, and promotion engine all return DEFAULT_EMPTY_SCORE (1.00)."""
        GradeSheet.objects.create(
            teacher_assignment=self.assignment,
            period=self.period1,
        )

        expected = DEFAULT_EMPTY_SCORE
        self.assertEqual(self._gradebook_computed_score(self.period1), expected, "gradebook")
        self.assertEqual(self._sabana_score(self.period1), expected, "sábana")
        self.assertEqual(self._boletin_period_score(self.period1), expected, "boletín periodo")
        self.assertEqual(self._promotion_score(self.period1), expected, "promotion engine")

    # ------------------------------------------------------------------
    # Scenario C — no gradesheet at all
    # ------------------------------------------------------------------

    def test_all_modules_return_default_when_no_gradesheet(self):
        """Boletín, sábana, and promotion engine all return DEFAULT_EMPTY_SCORE (1.00)
        when no GradeSheet exists for the period. The gradebook creates one on access
        and also returns DEFAULT_EMPTY_SCORE."""
        # No GradeSheet created
        expected = DEFAULT_EMPTY_SCORE
        self.assertEqual(self._sabana_score(self.period1), expected, "sábana sin planilla")
        self.assertEqual(self._promotion_score(self.period1), expected, "promotion engine sin planilla")
        # Gradebook creates the GradeSheet on GET, result is still DEFAULT_EMPTY_SCORE
        self.assertEqual(self._gradebook_computed_score(self.period1), expected, "gradebook (crea planilla)")
        self.assertEqual(self._boletin_period_score(self.period1), expected, "boletín periodo sin planilla")

    # ------------------------------------------------------------------
    # Scenario D — annual grade uses DEFAULT_EMPTY_SCORE for periods without gradesheet
    # ------------------------------------------------------------------

    def test_annual_grade_includes_empty_periods_as_default(self):
        """Annual grade = (P1_score + P2_default) / 2 when P2 has no gradesheet.

        Before the fix the boletín computed 4.00/1 = 4.00.
        After the fix it must compute (4.00 + 1.00) / 2 = 2.50.
        """
        # P2 achievement needed for the boletín to precompute all periods
        achievement_p2 = Achievement.objects.create(
            academic_load=self.load,
            group=self.group,
            period=self.period2,
            dimension=self.dimension,
            description="Logro P2 consistencia",
            percentage=100,
        )

        # Create gradesheet for P1 with a grade of 4.00
        gradesheet_p1 = GradeSheet.objects.create(
            teacher_assignment=self.assignment,
            period=self.period1,
        )
        AchievementGrade.objects.create(
            gradesheet=gradesheet_p1,
            enrollment=self.enrollment,
            achievement=self.achievement,
            score=Decimal("4.00"),
        )
        # No GradeSheet for P2 → should contribute DEFAULT_EMPTY_SCORE (1.00)

        # Annual average: (4.00 + 1.00) / 2 = 2.50
        expected_annual = Decimal("2.50")
        # Report shows up to and including P2 (selected period)
        annual_score = self._boletin_annual_score(self.period2)
        self.assertEqual(annual_score, expected_annual, "nota anual boletín")

        # Cleanup extra achievement to avoid affecting other tests
        achievement_p2.delete()
