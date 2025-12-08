from django.test import TestCase
from django.contrib.auth import get_user_model
from students.models import Student
from students.serializers import StudentSerializer

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
        self.assertEqual(student.user.email, "")
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
