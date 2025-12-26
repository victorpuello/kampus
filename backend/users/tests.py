from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import User


class UserPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username="admin", password="password", role=User.ROLE_ADMIN
        )
        self.teacher = User.objects.create_user(
            username="teacher", password="password", role=User.ROLE_TEACHER
        )
        self.student = User.objects.create_user(
            username="student", password="password", role=User.ROLE_STUDENT
        )

    def get_token(self, user):
        response = self.client.post(
            "/api/token/", {"username": user.username, "password": "password"}
        )
        return response.data["access"]

    def test_admin_can_list_users(self):
        token = self.get_token(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_teacher_cannot_list_users(self):
        token = self.get_token(self.teacher)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_list_users(self):
        token = self.get_token(self.student)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_can_view_own_profile(self):
        token = self.get_token(self.student)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        response = self.client.get(f"/api/users/{self.student.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_cannot_view_other_profile(self):
        token = self.get_token(self.student)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        response = self.client.get(f"/api/users/{self.teacher.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_can_change_own_password(self):
        token = self.get_token(self.teacher)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

        res = self.client.post(
            "/api/users/change_password/",
            {"current_password": "password", "new_password": "new-password-123"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Can login with new password
        login_res = self.client.post(
            "/api/token/", {"username": self.teacher.username, "password": "new-password-123"}
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_user_cannot_change_password_with_wrong_current(self):
        token = self.get_token(self.teacher)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

        res = self.client.post(
            "/api/users/change_password/",
            {"current_password": "wrong", "new_password": "new-password-123"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
