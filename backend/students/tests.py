from django.test import TestCase
from django.contrib.auth import get_user_model
from students.models import Student
from students.serializers import StudentSerializer
from rest_framework.test import APITestCase
from rest_framework import status

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
