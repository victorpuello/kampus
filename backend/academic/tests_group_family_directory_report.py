from rest_framework import status
from rest_framework.test import APITestCase

from academic.models import AcademicYear, Grade, Group
from students.models import Enrollment, FamilyMember, Student
from users.models import User


class GroupFamilyDirectoryReportAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_family_directory",
            password="admin123",
            email="admin_family_directory@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )

        self.year = AcademicYear.objects.create(year="2026", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        self.student_user = User.objects.create_user(
            username="student_family_1",
            password="pw123456",
            first_name="Ana",
            last_name="Pérez",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=self.student_user, document_number="1001")
        Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        FamilyMember.objects.create(
            student=self.student,
            full_name="Carlos Pérez",
            document_number="CC123",
            relationship="Padre",
            phone="3001112233",
            address="Calle 1 # 2-3",
            is_main_guardian=True,
        )

    def test_family_directory_report_returns_xlsx(self):
        self.client.force_authenticate(user=self.admin)

        res = self.client.get(f"/api/groups/{self.group.id}/family-directory-report/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn("directorio_padres_familia_grupo_", res["Content-Disposition"])
        self.assertGreater(len(res.content), 0)
