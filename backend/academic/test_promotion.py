from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academic.models import (
    AcademicLevel,
    AcademicLoad,
    AcademicYear,
    Achievement,
    Area,
    Dimension,
    Grade,
    GradeSheet,
    Group,
    Period,
    Subject,
    TeacherAssignment,
    AchievementGrade,
    EnrollmentPromotionSnapshot,
)
from students.models import Student, Enrollment


class PromotionApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.admin = User.objects.create_superuser(
            username="superadmin",
            email="sa@example.com",
            password="pass",
            role=User.ROLE_SUPERADMIN,
        )

        self.teacher = User.objects.create_user(
            username="teacher1",
            password="pass",
            email="t1@example.com",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Uno",
        )

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2025-01-01",
            end_date="2025-03-31",
            is_closed=True,
        )

        self.level = AcademicLevel.objects.create(name="Secundaria", level_type="SECONDARY")
        self.grade = Grade.objects.create(name="Noveno", level=self.level, ordinal=11)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, director=self.teacher)

        self.dimension = Dimension.objects.create(
            academic_year=self.year,
            name="Cognitivo",
            percentage=100,
            is_active=True,
        )

        student_user = User.objects.create_user(
            username="student1",
            password="pass",
            email="s1@example.com",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Uno",
        )
        self.student = Student.objects.create(user=student_user, document_number="DOC1")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        self.client.force_authenticate(user=self.admin)

    def _make_subject_with_score(self, *, area_name: str, subject_name: str, score: str, enrollment: Enrollment | None = None):
        target_enrollment = enrollment or self.enrollment
        area, _ = Area.objects.get_or_create(name=area_name)
        subject = Subject.objects.create(name=subject_name, area=area)
        load = AcademicLoad.objects.create(subject=subject, grade=self.grade)
        assignment = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=load,
            group=self.group,
            academic_year=self.year,
        )
        achievement = Achievement.objects.create(
            academic_load=load,
            group=self.group,
            period=self.period,
            dimension=self.dimension,
            description=f"Logro {subject_name}",
            percentage=100,
        )
        gradesheet = GradeSheet.objects.create(teacher_assignment=assignment, period=self.period)
        AchievementGrade.objects.create(
            gradesheet=gradesheet,
            enrollment=target_enrollment,
            achievement=achievement,
            score=Decimal(score),
        )
        return subject

    def test_three_failed_subjects_same_area_is_conditional(self):
        # 3 failed subjects in the same area => should be conditional (falls back to area criterion: 1 area)
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra", score="2.00")
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Geometría", score="2.00")
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Aritmética", score="2.00")

        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.final_status, "PROMOCIÓN CONDICIONAL")

        snap = EnrollmentPromotionSnapshot.objects.get(enrollment=self.enrollment)
        self.assertEqual(snap.decision, "CONDITIONAL")
        self.assertEqual(snap.failed_areas_count, 1)
        self.assertEqual(snap.failed_subjects_count, 3)
        self.assertEqual(snap.failed_subjects_distinct_areas_count, 1)

    def test_three_failed_subjects_different_areas_is_repeated(self):
        # Reset: new year to avoid closed status from prior test
        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=True,
        )
        self.group.academic_year = self.year
        self.group.save(update_fields=["academic_year"])
        self.enrollment.academic_year = self.year
        self.enrollment.final_status = ""
        self.enrollment.save(update_fields=["academic_year", "final_status"])

        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra 2", score="2.00")
        self._make_subject_with_score(area_name="Ciencias", subject_name="Biología", score="2.00")
        self._make_subject_with_score(area_name="Humanidades", subject_name="Lengua", score="2.00")

        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.final_status, "REPROBÓ / REPITE")

        snap = EnrollmentPromotionSnapshot.objects.get(enrollment=self.enrollment)
        self.assertEqual(snap.decision, "REPEATED")
        self.assertGreaterEqual(snap.failed_areas_count, 2)
        self.assertEqual(snap.failed_subjects_count, 3)

    def test_apply_promotions_creates_next_year_enrollments(self):
        # Close 2025 with a conditional outcome (1 failed area)
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra", score="2.00")

        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        # Prepare target year 2026 and next grade
        target_year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_PLANNING)
        # First period for PAP deadline
        Period.objects.create(
            academic_year=target_year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=False,
        )
        next_grade = Grade.objects.create(name="Décimo", level=self.level, ordinal=12)
        target_group = Group.objects.create(name="A", grade=next_grade, academic_year=target_year, director=self.teacher)

        apply_resp = self.client.post(
            f"/api/academic-years/{self.year.id}/apply-promotions/",
            {"target_academic_year": target_year.id},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, 200)
        self.assertEqual(apply_resp.data["created"], 1)

        new_enrollment = Enrollment.objects.get(student=self.student, academic_year=target_year)
        self.assertEqual(new_enrollment.grade_id, next_grade.id)
        self.assertEqual(new_enrollment.status, "ACTIVE")
        self.assertEqual(new_enrollment.group_id, target_group.id)

        # Conditional promotion should create a conditional plan
        from students.models import ConditionalPromotionPlan

        plan = ConditionalPromotionPlan.objects.get(enrollment=new_enrollment)
        self.assertEqual(plan.status, ConditionalPromotionPlan.STATUS_OPEN)

    def test_apply_promotions_can_exclude_repeated(self):
        # Force a REPEATED outcome (3 failed subjects in different areas)
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra", score="2.00")
        self._make_subject_with_score(area_name="Ciencias", subject_name="Biología", score="2.00")
        self._make_subject_with_score(area_name="Humanidades", subject_name="Lengua", score="2.00")

        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        target_year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_PLANNING)
        Period.objects.create(
            academic_year=target_year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=False,
        )

        apply_resp = self.client.post(
            f"/api/academic-years/{self.year.id}/apply-promotions/",
            {"target_academic_year": target_year.id, "exclude_repeated": True},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, 200)
        self.assertEqual(apply_resp.data["created"], 0)
        self.assertEqual(apply_resp.data.get("skipped_repeated"), 1)
        self.assertFalse(Enrollment.objects.filter(student=self.student, academic_year=target_year).exists())

    def test_apply_promotions_with_enrollment_ids_filters(self):
        User = get_user_model()

        student2_user = User.objects.create_user(
            username="student2",
            password="pass",
            email="s2@example.com",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Dos",
        )
        student2 = Student.objects.create(user=student2_user, document_number="DOC2")

        # Put the second student in a different group with no assignments/achievements,
        # so their subject_final_scores is empty => PROMOTED.
        group2 = Group.objects.create(name="B", grade=self.grade, academic_year=self.year, director=self.teacher)

        enrollment2 = Enrollment.objects.create(
            student=student2,
            academic_year=self.year,
            grade=self.grade,
            group=group2,
            status="ACTIVE",
        )

        # Make the original enrollment REPEATED, leave enrollment2 as PROMOTED by default
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra", score="2.00", enrollment=self.enrollment)
        self._make_subject_with_score(area_name="Ciencias", subject_name="Biología", score="2.00", enrollment=self.enrollment)
        self._make_subject_with_score(area_name="Humanidades", subject_name="Lengua", score="2.00", enrollment=self.enrollment)

        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        target_year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_PLANNING)
        Period.objects.create(
            academic_year=target_year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=False,
        )
        next_grade = Grade.objects.create(name="Décimo", level=self.level, ordinal=12)
        target_group = Group.objects.create(name="A", grade=next_grade, academic_year=target_year, director=self.teacher)

        apply_resp = self.client.post(
            f"/api/academic-years/{self.year.id}/apply-promotions/",
            {"target_academic_year": target_year.id, "enrollment_ids": [enrollment2.id], "exclude_repeated": True},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, 200)
        self.assertEqual(apply_resp.data["created"], 1)

        new_enrollment2 = Enrollment.objects.get(student=student2, academic_year=target_year)
        self.assertEqual(new_enrollment2.grade_id, next_grade.id)
        self.assertEqual(new_enrollment2.group_id, target_group.id)
        self.assertFalse(Enrollment.objects.filter(student=self.student, academic_year=target_year).exists())

    def test_apply_promotions_requires_group_selection_when_ambiguous(self):
        # Conditional outcome
        self._make_subject_with_score(area_name="Matemáticas", subject_name="Algebra", score="2.00")
        resp = self.client.post(f"/api/academic-years/{self.year.id}/close-with-promotion/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

        target_year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_PLANNING)
        Period.objects.create(
            academic_year=target_year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=False,
        )
        next_grade = Grade.objects.create(name="Décimo", level=self.level, ordinal=12)

        g1 = Group.objects.create(name="A", grade=next_grade, academic_year=target_year, director=self.teacher)
        Group.objects.create(name="B", grade=next_grade, academic_year=target_year, director=self.teacher)

        # Without target_group_id => should fail (ambiguous groups)
        apply_resp = self.client.post(
            f"/api/academic-years/{self.year.id}/apply-promotions/",
            {"target_academic_year": target_year.id},
            format="json",
        )
        self.assertEqual(apply_resp.status_code, 400)

        # With target_group_id => should succeed
        apply_resp2 = self.client.post(
            f"/api/academic-years/{self.year.id}/apply-promotions/",
            {"target_academic_year": target_year.id, "target_group_id": g1.id},
            format="json",
        )
        self.assertEqual(apply_resp2.status_code, 200)
        self.assertEqual(apply_resp2.data["created"], 1)

        new_enrollment = Enrollment.objects.get(student=self.student, academic_year=target_year)
        self.assertEqual(new_enrollment.group_id, g1.id)
