from django.test import TestCase
from django.contrib.auth import get_user_model
from students.models import Student, Enrollment
from students.serializers import StudentSerializer
from rest_framework.test import APITestCase
from rest_framework import status
from academic.models import AcademicYear, Grade, Group

User = get_user_model()

class StudentSerializerTest(TestCase):
    def test_create_student(self):
        data = {
            "first_name": "Juan",
            "last_name": "Perez",
            "email": "",  # Empty email should be allowed
            "document_number": "123456789",
            "place_of_issue": "Bogota - Cundinamarca"
        }
        serializer = StudentSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        student = serializer.save()
        
        self.assertEqual(student.user.first_name, "Juan")
        self.assertEqual(student.user.last_name, "Perez")
        self.assertEqual(student.user.username, "juan.perez")
        self.assertIsNone(student.user.email)
        self.assertEqual(student.place_of_issue, "Bogota - Cundinamarca")

    def test_read_student(self):
        user = User.objects.create_user(username="maria.gomez", first_name="Maria", last_name="Gomez", email="maria@example.com", role=User.ROLE_STUDENT)
        student = Student.objects.create(user=user, document_number="987654321")
        
        serializer = StudentSerializer(student)
        data = serializer.data
        
        self.assertEqual(data['user']['username'], "maria.gomez")
        self.assertEqual(data['user']['first_name'], "Maria")
        self.assertEqual(data['user']['email'], "maria@example.com")
        self.assertEqual(data['document_number'], "987654321")


class StudentListPaginationAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin",
            password="admin123",
            email="admin@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        for i in range(30):
            user = User.objects.create_user(
                username=f"s{i}",
                password="pw123456",
                first_name=f"Nombre{i}",
                last_name=f"Apellido{i}",
                role=User.ROLE_STUDENT,
            )
            Student.objects.create(user=user, document_number=f"DOC{i:03d}")

    def test_students_list_is_paginated(self):
        res = self.client.get("/api/students/?page=1&page_size=10")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)
        self.assertEqual(len(res.data["results"]), 10)

    def test_students_list_can_exclude_active_enrollment_year(self):
        year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        grade = Grade.objects.create(name="1", ordinal=1)

        u1 = User.objects.create_user(
            username="enrolled_student",
            password="pw123456",
            first_name="A",
            last_name="Enrolled",
            role=User.ROLE_STUDENT,
        )
        s1 = Student.objects.create(user=u1, document_number="DOC_ENR")
        Enrollment.objects.create(
            student=s1,
            academic_year=year,
            grade=grade,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="not_enrolled_student",
            password="pw123456",
            first_name="B",
            last_name="Free",
            role=User.ROLE_STUDENT,
        )
        s2 = Student.objects.create(user=u2, document_number="DOC_FREE")

        res = self.client.get(f"/api/students/?exclude_active_enrollment_year={year.id}&page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.data.get("results", [])]
        self.assertNotIn(s1.user_id, ids)
        self.assertIn(s2.user_id, ids)


class EnrollmentListPaginationAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_enr",
            password="admin123",
            email="admin_enr@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

    def test_enrollments_list_is_paginated(self):
        res = self.client.get("/api/enrollments/?page=1&page_size=10")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)


class EnrollmentPartialUpdateAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_patch",
            password="admin123",
            email="admin_patch@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade_a = Grade.objects.create(name="1", ordinal=1)
        self.grade_b = Grade.objects.create(name="2", ordinal=2)
        self.group_a = Group.objects.create(name="A", grade=self.grade_a, academic_year=self.year, capacity=40)
        self.group_b = Group.objects.create(name="B", grade=self.grade_b, academic_year=self.year, capacity=40)

        u = User.objects.create_user(
            username="student_patch",
            password="pw123456",
            first_name="Patch",
            last_name="Student",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_PATCH")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade_a,
            group=self.group_a,
            status="ACTIVE",
        )

    def test_patch_enrollment_can_change_grade_and_group_without_academic_year(self):
        res = self.client.patch(
            f"/api/enrollments/{self.enrollment.id}/",
            {"grade": self.grade_b.id, "group": self.group_b.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.grade_id, self.grade_b.id)
        self.assertEqual(self.enrollment.group_id, self.group_b.id)


class EnrollmentReportExportAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_report",
            password="admin123",
            email="admin_report@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        u = User.objects.create_user(
            username="student_report",
            password="pw123456",
            first_name="Juan",
            last_name="Perez",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_REPORT")
        Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

    def test_report_csv_downloads(self):
        res = self.client.get(f"/api/enrollments/report/?export=csv&year={self.year.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res["Content-Type"].startswith("text/csv"))
        content = res.content
        self.assertIn(b"Documento", content)
        self.assertIn(b"DOC_REPORT", content)

    def test_report_xlsx_downloads(self):
        res = self.client.get(f"/api/enrollments/report/?export=xlsx&year={self.year.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        # XLSX files start with PK (zip)
        self.assertTrue(res.content.startswith(b"PK"))
