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
    Group,
    Period,
    Subject,
    TeacherAssignment,
    AchievementGrade,
)
from students.models import Student, Enrollment


class GradebookApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.teacher = User.objects.create_user(
            username="teacher1",
            password="pass",
            email="t1@example.com",
            role="TEACHER",
            first_name="Docente",
            last_name="Uno",
        )

        self.teacher2 = User.objects.create_user(
            username="teacher2",
            password="pass",
            email="t2@example.com",
            role="TEACHER",
            first_name="Docente",
            last_name="Dos",
        )

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2025-01-01",
            end_date="2025-03-31",
            is_closed=False,
        )

        self.level = AcademicLevel.objects.create(name="Primaria", level_type="PRIMARY")
        self.grade = Grade.objects.create(name="1", level=self.level)
        self.group = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher,
        )
        self.group2 = Group.objects.create(
            name="B",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher2,
        )

        self.area = Area.objects.create(name="Matemáticas")
        self.subject = Subject.objects.create(name="Matemáticas 1", area=self.area)
        self.load = AcademicLoad.objects.create(subject=self.subject, grade=self.grade)

        self.assignment = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=self.load,
            group=self.group,
            academic_year=self.year,
        )
        self.assignment_other = TeacherAssignment.objects.create(
            teacher=self.teacher2,
            academic_load=self.load,
            group=self.group2,
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
            description="Suma y resta",
            percentage=100,
        )

        student_user = User.objects.create_user(
            username="student1",
            password="pass",
            email="s1@example.com",
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

        self.client.force_authenticate(user=self.teacher)

    def test_gradebook_null_cell_computes_as_one(self):
        resp = self.client.get(
            "/api/grade-sheets/gradebook/",
            {"teacher_assignment": self.assignment.id, "period": self.period.id},
        )
        self.assertEqual(resp.status_code, 200)

        computed = resp.data["computed"]
        row = next(x for x in computed if x["enrollment_id"] == self.enrollment.id)
        self.assertEqual(Decimal(str(row["final_score"])), Decimal("1.00"))

        cells = resp.data["cells"]
        cell = next(
            x
            for x in cells
            if x["enrollment"] == self.enrollment.id and x["achievement"] == self.achievement.id
        )
        self.assertIsNone(cell["score"])

    def test_bulk_upsert_sets_score_and_recomputes(self):
        resp = self.client.post(
            "/api/grade-sheets/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "score": "4.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["updated"], 1)

        self.assertTrue(
            AchievementGrade.objects.filter(
                enrollment_id=self.enrollment.id,
                achievement_id=self.achievement.id,
            ).exists()
        )

        resp2 = self.client.get(
            "/api/grade-sheets/gradebook/",
            {"teacher_assignment": self.assignment.id, "period": self.period.id},
        )
        row = next(x for x in resp2.data["computed"] if x["enrollment_id"] == self.enrollment.id)
        self.assertEqual(Decimal(str(row["final_score"])), Decimal("4.00"))

    def test_bulk_upsert_blocked_when_period_closed(self):
        self.period.is_closed = True
        self.period.save(update_fields=["is_closed"])

        resp = self.client.post(
            "/api/grade-sheets/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {
                        "enrollment": self.enrollment.id,
                        "achievement": self.achievement.id,
                        "score": "4.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_teacher_cannot_access_other_assignment(self):
        resp = self.client.get(
            "/api/grade-sheets/gradebook/",
            {"teacher_assignment": self.assignment_other.id, "period": self.period.id},
        )
        self.assertEqual(resp.status_code, 404)
