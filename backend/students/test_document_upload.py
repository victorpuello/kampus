from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from students.models import Student
from django.core.files.uploadedfile import SimpleUploadedFile

User = get_user_model()

class StudentDocumentUploadTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username="admin", 
            email="admin@example.com", 
            password="password123",
            role=User.ROLE_ADMIN
        )
        self.client.force_authenticate(user=self.admin_user)
        
        # Create a student
        self.student_user = User.objects.create_user(
            username="student", 
            password="password123",
            role=User.ROLE_STUDENT
        )
        self.student = Student.objects.create(
            user=self.student_user,
            document_number="123456789"
        )

    def test_upload_photo(self):
        # Create a dummy image file
        image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        photo = SimpleUploadedFile("photo.png", image_content, content_type="image/png")
        
        data = {
            "student": self.student.pk,
            "document_type": "PHOTO",
            "file": photo
        }
        
        response = self.client.post("/api/documents/", data, format='multipart')
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
            
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['document_type'], 'PHOTO')
