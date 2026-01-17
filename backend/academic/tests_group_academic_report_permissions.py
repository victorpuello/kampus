from rest_framework import status
from rest_framework.test import APITestCase

from academic.models import AcademicYear, Grade, Group, TeacherAssignment
from users.models import User


class GroupAcademicReportPermissionsAPITest(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="t_group_report",
            password="pw123456",
            first_name="Doc",
            last_name="Reporte",
            role=User.ROLE_TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            username="t_group_report_other",
            password="pw123456",
            first_name="Doc",
            last_name="Otro",
            role=User.ROLE_TEACHER,
        )
        self.admin = User.objects.create_superuser(
            username="admin_group_report",
            password="admin123",
            email="admin_group_report@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        # Teacher is assigned to the group (not necessarily director)
        TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=None,
            group=self.group,
            academic_year=self.year,
        )

    def test_teacher_assigned_group_is_not_forbidden(self):
        """Assigned teacher should not get 403; downstream may be 404/400 depending on period/enrollments."""
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(f"/api/groups/{self.group.id}/academic-report/?period=999999")
        self.assertNotEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_unassigned_group_forbidden(self):
        self.client.force_authenticate(user=self.other_teacher)
        res = self.client.get(f"/api/groups/{self.group.id}/academic-report/?period=999999")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_is_not_forbidden(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/groups/{self.group.id}/academic-report/?period=999999")
        self.assertNotEqual(res.status_code, status.HTTP_403_FORBIDDEN)
