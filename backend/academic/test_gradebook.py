from decimal import Decimal

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from academic.models import (
    AcademicLevel,
    AcademicLoad,
    AcademicYear,
    Achievement,
    AchievementActivityColumn,
    AchievementActivityGrade,
    Area,
    Dimension,
    EditGrant,
    EditGrantItem,
    EditRequest,
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

        self.assertIn("dimensions", resp.data)
        self.assertTrue(any(d["id"] == self.dimension.id for d in resp.data["dimensions"]))

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

        self.assertIn("computed", resp.data)
        row = next(x for x in resp.data["computed"] if x["enrollment_id"] == self.enrollment.id)
        self.assertEqual(Decimal(str(row["final_score"])), Decimal("4.00"))

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

    def test_set_grading_mode_activities_creates_default_columns_and_payload(self):
        resp = self.client.post(
            "/api/grade-sheets/set-grading-mode/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grading_mode": "ACTIVITIES",
                "default_columns": 2,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get("created_columns"), 2)

        cols = AchievementActivityColumn.objects.filter(
            gradesheet__teacher_assignment=self.assignment,
            gradesheet__period=self.period,
            achievement=self.achievement,
            is_active=True,
        ).order_by("order")
        self.assertEqual(cols.count(), 2)
        self.assertEqual(cols[0].label, "Actividad 1")
        self.assertEqual(cols[1].label, "Actividad 2")

        gb = self.client.get(
            "/api/grade-sheets/gradebook/",
            {"teacher_assignment": self.assignment.id, "period": self.period.id},
        )
        self.assertEqual(gb.status_code, 200)
        self.assertEqual(gb.data["gradesheet"]["grading_mode"], "ACTIVITIES")
        self.assertIn("activity_columns", gb.data)
        self.assertIn("activity_cells", gb.data)

        self.assertEqual(len(gb.data["activity_columns"]), 2)
        self.assertEqual(len(gb.data["activity_cells"]), 2)  # 1 enrollment * 2 columns

        any_cell = gb.data["activity_cells"][0]
        self.assertIn("enrollment", any_cell)
        self.assertIn("column", any_cell)
        self.assertIn("score", any_cell)

    def test_activity_grades_bulk_upsert_recomputes_average_with_blanks_as_one(self):
        self.client.post(
            "/api/grade-sheets/set-grading-mode/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grading_mode": "ACTIVITIES",
                "default_columns": 2,
            },
            format="json",
        )

        cols = list(
            AchievementActivityColumn.objects.filter(
                gradesheet__teacher_assignment=self.assignment,
                gradesheet__period=self.period,
                achievement=self.achievement,
                is_active=True,
            ).order_by("order")
        )
        self.assertEqual(len(cols), 2)

        # Only set score for first activity; second one is missing => counts as 1.00
        resp = self.client.post(
            "/api/grade-sheets/activity-grades/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {"enrollment": self.enrollment.id, "column": cols[0].id, "score": "5.00"}
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get("updated"), 1)
        self.assertEqual(resp.data.get("blocked"), [])

        # Average should be (5.00 + 1.00) / 2 = 3.00
        cell = AchievementGrade.objects.get(
            enrollment_id=self.enrollment.id,
            achievement_id=self.achievement.id,
            gradesheet__teacher_assignment=self.assignment,
            gradesheet__period=self.period,
        )
        self.assertEqual(cell.score, Decimal("3.00"))

        row = next(x for x in resp.data["computed"] if x["enrollment_id"] == self.enrollment.id)
        self.assertEqual(Decimal(str(row["final_score"])), Decimal("3.00"))

    def test_activity_grades_blocked_after_deadline_without_grant_and_allowed_with_partial_grant(self):
        self.client.post(
            "/api/grade-sheets/set-grading-mode/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grading_mode": "ACTIVITIES",
                "default_columns": 1,
            },
            format="json",
        )
        col = AchievementActivityColumn.objects.get(
            gradesheet__teacher_assignment=self.assignment,
            gradesheet__period=self.period,
            achievement=self.achievement,
            order=1,
        )

        self.period.grades_edit_until = timezone.now() - timedelta(days=1)
        self.period.save(update_fields=["grades_edit_until"])

        blocked_resp = self.client.post(
            "/api/grade-sheets/activity-grades/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {"enrollment": self.enrollment.id, "column": col.id, "score": "4.00"}
                ],
            },
            format="json",
        )
        self.assertEqual(blocked_resp.status_code, 200)
        self.assertEqual(blocked_resp.data.get("updated"), 0)
        self.assertEqual(blocked_resp.data.get("requested"), 1)
        self.assertEqual(len(blocked_resp.data.get("blocked", [])), 1)

        # Grant partial permission for this enrollment
        grant = EditGrant.objects.create(
            scope=EditRequest.SCOPE_GRADES,
            grant_type=EditRequest.TYPE_PARTIAL,
            granted_to=self.teacher,
            period=self.period,
            teacher_assignment=self.assignment,
            valid_until=timezone.now() + timedelta(days=1),
        )
        EditGrantItem.objects.create(grant=grant, enrollment=self.enrollment)

        allowed_resp = self.client.post(
            "/api/grade-sheets/activity-grades/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grades": [
                    {"enrollment": self.enrollment.id, "column": col.id, "score": "4.00"}
                ],
            },
            format="json",
        )
        self.assertEqual(allowed_resp.status_code, 200)
        self.assertEqual(allowed_resp.data.get("updated"), 1)
        self.assertEqual(allowed_resp.data.get("blocked"), [])
        self.assertTrue(
            AchievementActivityGrade.objects.filter(
                enrollment_id=self.enrollment.id,
                column_id=col.id,
            ).exists()
        )

    def test_activity_columns_bulk_upsert_requires_full_grant_after_deadline(self):
        self.client.post(
            "/api/grade-sheets/set-grading-mode/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "grading_mode": "ACTIVITIES",
                "default_columns": 0,
            },
            format="json",
        )

        self.period.grades_edit_until = timezone.now() - timedelta(days=1)
        self.period.save(update_fields=["grades_edit_until"])

        denied = self.client.post(
            "/api/grade-sheets/activity-columns/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "columns": [
                    {"achievement": self.achievement.id, "label": "Actividad 1", "order": 1}
                ],
            },
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        EditGrant.objects.create(
            scope=EditRequest.SCOPE_GRADES,
            grant_type=EditRequest.TYPE_FULL,
            granted_to=self.teacher,
            period=self.period,
            teacher_assignment=self.assignment,
            valid_until=timezone.now() + timedelta(days=1),
        )

        allowed = self.client.post(
            "/api/grade-sheets/activity-columns/bulk-upsert/",
            {
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "columns": [
                    {"achievement": self.achievement.id, "label": "Actividad 1", "order": 1}
                ],
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data.get("created"), 1)
