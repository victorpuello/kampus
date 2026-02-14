from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from users.models import User
from academic.models import AcademicYear, Period
from .models import Teacher


class TeacherTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Admin
        self.admin_user = User.objects.create_user(
            username="admin", password="password", role=User.ROLE_ADMIN
        )
        self.admin_token = self.get_token(self.admin_user)

        # Create Teacher
        self.teacher_user = User.objects.create_user(
            username="teacher", password="password", role=User.ROLE_TEACHER
        )
        self.teacher = Teacher.objects.create(
            user=self.teacher_user, title="Licenciado", specialty="Math"
        )
        self.teacher_token = self.get_token(self.teacher_user)

        # Create Another Teacher
        self.other_teacher_user = User.objects.create_user(
            username="other", password="password", role=User.ROLE_TEACHER
        )
        self.other_teacher = Teacher.objects.create(
            user=self.other_teacher_user, title="Ingeniero", specialty="Physics"
        )

    def get_token(self, user):
        response = self.client.post(
            "/api/token/", {"username": user.username, "password": "password"}
        )
        return response.data["access"]

    def test_create_teacher_as_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + self.admin_token)
        data = {
            "first_name": "New",
            "last_name": "Teacher",
            "email": "new@teacher.com",
            "title": "Master",
            "specialty": "History",
        }
        response = self.client.post("/api/teachers/", data, format="json")
        if response.status_code != status.HTTP_201_CREATED:
            print(response.data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Username is generated as new.teacher
        self.assertTrue(Teacher.objects.filter(user__username="new.teacher").exists())

    def test_teacher_can_view_own_profile(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + self.teacher_token)
        response = self.client.get(f"/api/teachers/{self.teacher.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_teacher_cannot_view_other_profile(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + self.teacher_token)
        response = self.client.get(f"/api/teachers/{self.other_teacher.pk}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_view_all(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + self.admin_token)
        response = self.client.get("/api/teachers/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # teacher and other_teacher

    def test_teacher_dashboard_summary_returns_widget_payload(self):
        year = AcademicYear.objects.create(year="2026", status=AcademicYear.STATUS_ACTIVE)
        Period.objects.create(
            academic_year=year,
            name="Periodo 1",
            start_date="2026-01-10",
            end_date="2026-03-30",
            is_closed=False,
        )

        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + self.teacher_token)
        response = self.client.get("/api/teachers/me/dashboard-summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("academic_year", response.data)
        self.assertIn("periods", response.data)
        self.assertIn("widgets", response.data)
        self.assertIn("performance", response.data["widgets"])
        self.assertIn("planning", response.data["widgets"])
        self.assertIn("student_records", response.data["widgets"])
        self.assertIn("grade_sheets", response.data["widgets"])
