from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from academic.models import (
    AcademicLevel,
    AcademicLoad,
    AcademicYear,
    Achievement,
    Area,
    Dimension,
    EvaluationScale,
    Grade,
    Group,
    Period,
    Subject,
    TeacherAssignment,
    AchievementGrade,
    EditGrant,
    EditGrantItem,
)
from students.models import Enrollment, Student


class PreschoolGradebookApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.teacher = User.objects.create_user(
            username="teacher_p",
            password="pass",
            email="tp@example.com",
            role="TEACHER",
            first_name="Docente",
            last_name="Preescolar",
        )

        self.admin = User.objects.create_user(
            username="admin1",
            password="pass",
            email="a1@example.com",
            role="ADMIN",
            first_name="Admin",
            last_name="Uno",
        )

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)

        today = timezone.localdate()
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date=today - timedelta(days=7),
            end_date=today + timedelta(days=30),
            is_closed=False,
        )

        self.level = AcademicLevel.objects.create(name="Preescolar", level_type="PRESCHOOL")
        self.grade = Grade.objects.create(name="Prejardín", level=self.level)
        self.group = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher,
        )

        self.area = Area.objects.create(name="Dimensiones")
        self.subject = Subject.objects.create(name="Integral", area=self.area)
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

        self.achievement = Achievement.objects.create(
            academic_load=self.load,
            group=self.group,
            period=self.period,
            dimension=self.dimension,
            description="Reconoce colores",
            percentage=100,
        )

        student_user = User.objects.create_user(
            username="student_p1",
            password="pass",
            email="sp1@example.com",
            role="STUDENT",
            first_name="Estudiante",
            last_name="Uno",
        )
        self.student = Student.objects.create(user=student_user)
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        # Qualitative labels for preschool 2026
        self.scale_1 = EvaluationScale.objects.create(
            academic_year=self.year,
            name="Avanza con seguridad",
            description="",
            scale_type="QUALITATIVE",
            applies_to_level="PRESCHOOL",
            is_default=True,
            order=1,
            internal_numeric_value=Decimal("4.00"),
        )
        self.scale_2 = EvaluationScale.objects.create(
            academic_year=self.year,
            name="En proceso",
            description="",
            scale_type="QUALITATIVE",
            applies_to_level="PRESCHOOL",
            is_default=True,
            order=2,
            internal_numeric_value=Decimal("3.00"),
        )

        self.client.force_authenticate(user=self.teacher)

    def test_labels_returns_preschool_default_labels(self):
        res = self.client.get(
            "/api/preschool-gradebook/labels/",
            {"academic_year": self.year.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("results", res.data)
        ids = [x["id"] for x in res.data["results"]]
        self.assertIn(self.scale_1.id, ids)
        self.assertIn(self.scale_2.id, ids)

    def test_gradebook_returns_cells_and_labels_and_sets_mode(self):
        res = self.client.get(
            "/api/preschool-gradebook/gradebook/",
            {"teacher_assignment": self.assignment.id, "period": self.period.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("labels", res.data)
        self.assertIn("cells", res.data)

        gradesheet = res.data["gradesheet"]
        self.assertEqual(gradesheet["grading_mode"], "QUALITATIVE")

        cell = next(
            x
            for x in res.data["cells"]
            if x["enrollment"] == self.enrollment.id and x["achievement"] == self.achievement.id
        )
        self.assertIsNone(cell["qualitative_scale"])

    def test_bulk_upsert_sets_qualitative_scale(self):
        res = self.client.post(
            "/api/preschool-gradebook/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "qualitative_scale": self.scale_1.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["updated"], 1)

        row = AchievementGrade.objects.get(
            enrollment_id=self.enrollment.id,
            achievement_id=self.achievement.id,
        )
        self.assertEqual(row.qualitative_scale_id, self.scale_1.id)
        self.assertEqual(Decimal(str(row.score)), Decimal("4.00"))

    def test_non_teacher_forbidden(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            "/api/preschool-gradebook/gradebook/",
            {"teacher_assignment": self.assignment.id, "period": self.period.id},
        )
        self.assertEqual(res.status_code, 403)

    def test_teacher_non_preschool_assignment_forbidden(self):
        """A TEACHER can hit the endpoints, but only for PRESCHOOL assignments."""
        User = get_user_model()
        teacher2 = User.objects.create_user(
            username="teacher_np",
            password="pass",
            email="tnp@example.com",
            role="TEACHER",
            first_name="Docente",
            last_name="NoPreescolar",
        )

        level_primary = AcademicLevel.objects.create(name="Primaria", level_type="PRIMARY")
        grade_primary = Grade.objects.create(name="Primero", level=level_primary)
        group_primary = Group.objects.create(name="B", grade=grade_primary, academic_year=self.year, director=teacher2)
        load_primary = AcademicLoad.objects.create(subject=self.subject, grade=grade_primary)
        assignment_primary = TeacherAssignment.objects.create(
            teacher=teacher2,
            academic_load=load_primary,
            group=group_primary,
            academic_year=self.year,
        )

        self.client.force_authenticate(user=teacher2)
        res = self.client.get(
            "/api/preschool-gradebook/gradebook/",
            {"teacher_assignment": assignment_primary.id, "period": self.period.id},
        )
        self.assertEqual(res.status_code, 403)

    def test_bulk_upsert_period_closed_returns_400(self):
        self.period.is_closed = True
        self.period.save(update_fields=["is_closed"])

        res = self.client.post(
            "/api/preschool-gradebook/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "qualitative_scale": self.scale_1.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_bulk_upsert_after_deadline_blocks_without_grant(self):
        self.period.grades_edit_until = timezone.now() - timedelta(days=1)
        self.period.save(update_fields=["grades_edit_until"])

        res = self.client.post(
            "/api/preschool-gradebook/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "qualitative_scale": self.scale_1.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["updated"], 0)
        self.assertEqual(len(res.data.get("blocked", [])), 1)

    def test_bulk_upsert_after_deadline_allows_with_partial_grant(self):
        self.period.grades_edit_until = timezone.now() - timedelta(days=1)
        self.period.save(update_fields=["grades_edit_until"])

        grant = EditGrant.objects.create(
            scope="GRADES",
            grant_type="PARTIAL",
            granted_to=self.teacher,
            period=self.period,
            teacher_assignment=self.assignment,
            valid_until=timezone.now() + timedelta(days=1),
            created_by=self.admin,
        )
        EditGrantItem.objects.create(grant=grant, enrollment_id=self.enrollment.id)

        res = self.client.post(
            "/api/preschool-gradebook/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "qualitative_scale": self.scale_1.id,
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["updated"], 1)
