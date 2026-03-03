import io
import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from students.models import FamilyMember, Student, StudentDocument

User = get_user_model()


class DocumentCompressionAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username="admin_compress",
            email="admin_compress@example.com",
            password="password123",
            role=User.ROLE_ADMIN,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.student_user = User.objects.create_user(
            username="student_compress",
            password="password123",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            document_number="1234567890",
        )

        self.temp_media = tempfile.mkdtemp(prefix="kampus_media_")
        self.temp_private = tempfile.mkdtemp(prefix="kampus_private_")
        self.override = override_settings(MEDIA_ROOT=self.temp_media, PRIVATE_STORAGE_ROOT=self.temp_private)
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.temp_media, ignore_errors=True)
        shutil.rmtree(self.temp_private, ignore_errors=True)
        os.environ.pop("KAMPUS_IMAGE_WEBP_QUALITY", None)
        os.environ.pop("KAMPUS_IMAGE_WEBP_METHOD", None)

    def _make_image_upload(self, name: str, fmt: str, color=(50, 100, 150)) -> SimpleUploadedFile:
        buffer = io.BytesIO()
        image = Image.new("RGB", (640, 400), color=color)
        image.save(buffer, format=fmt)
        mime = "image/jpeg" if fmt.upper() in {"JPG", "JPEG"} else "image/png"
        return SimpleUploadedFile(name, buffer.getvalue(), content_type=mime)

    def _make_pdf_upload(self, name: str = "documento.pdf") -> SimpleUploadedFile:
        content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        return SimpleUploadedFile(name, content, content_type="application/pdf")

    def _make_detailed_png_bytes(self) -> bytes:
        image = Image.new("RGB", (640, 400))
        pixels = []
        for y in range(400):
            for x in range(640):
                pixels.append(((x * 13 + y * 7) % 256, (x * 3 + y * 11) % 256, (x * 17 + y * 5) % 256))
        image.putdata(pixels)

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def test_public_image_document_is_compressed_to_webp(self):
        upload = self._make_image_upload("foto.png", "PNG")

        response = self.client.post(
            "/api/documents/",
            {
                "student": self.student.pk,
                "document_type": "PHOTO",
                "file": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = StudentDocument.objects.get(pk=response.data["id"])
        self.assertTrue(document.file)
        self.assertTrue(str(document.file.name).lower().endswith(".webp"))
        self.assertFalse((document.file_private_relpath or "").strip())

    def test_private_identity_image_document_is_compressed_to_webp(self):
        upload = self._make_image_upload("identidad.jpg", "JPEG")

        response = self.client.post(
            "/api/documents/",
            {
                "student": self.student.pk,
                "document_type": "IDENTITY",
                "file": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = StudentDocument.objects.get(pk=response.data["id"])
        self.assertFalse(bool(document.file))
        self.assertTrue((document.file_private_relpath or "").lower().endswith(".webp"))

        download_response = self.client.get(f"/api/documents/{document.id}/download/")
        self.assertEqual(download_response.status_code, status.HTTP_200_OK)
        self.assertTrue(download_response["Content-Type"].startswith("image/webp"))

    def test_pdf_document_is_not_compressed(self):
        upload = self._make_pdf_upload("certificado.pdf")

        response = self.client.post(
            "/api/documents/",
            {
                "student": self.student.pk,
                "document_type": "ACADEMIC",
                "file": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = StudentDocument.objects.get(pk=response.data["id"])
        self.assertTrue(document.file)
        self.assertTrue(str(document.file.name).lower().endswith(".pdf"))

    def test_family_member_identity_image_is_compressed_to_webp(self):
        upload = self._make_image_upload("acudiente.png", "PNG", color=(10, 80, 10))

        response = self.client.post(
            "/api/family-members/",
            {
                "student": self.student.pk,
                "full_name": "Acudiente Prueba",
                "relationship": "Padre",
                "document_number": "CC12345",
                "identity_document": upload,
                "phone": "3000000000",
                "email": "acudiente@example.com",
                "address": "Calle 123",
                "is_main_guardian": False,
                "is_head_of_household": False,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        member = FamilyMember.objects.get(pk=response.data["id"])
        self.assertTrue((member.identity_document_private_relpath or "").lower().endswith(".webp"))
        self.assertFalse(bool(member.identity_document))

        download_response = self.client.get(f"/api/family-members/{member.id}/identity-document/download/")
        self.assertEqual(download_response.status_code, status.HTTP_200_OK)
        self.assertTrue(download_response["Content-Type"].startswith("image/webp"))

    def test_webp_quality_env_changes_compressed_size(self):
        png_bytes = self._make_detailed_png_bytes()

        os.environ["KAMPUS_IMAGE_WEBP_QUALITY"] = "30"
        response_low = self.client.post(
            "/api/documents/",
            {
                "student": self.student.pk,
                "document_type": "PHOTO",
                "file": SimpleUploadedFile("detalle.png", png_bytes, content_type="image/png"),
            },
            format="multipart",
        )
        self.assertEqual(response_low.status_code, status.HTTP_201_CREATED)
        low_quality_doc = StudentDocument.objects.get(pk=response_low.data["id"])
        low_size = low_quality_doc.file.size

        os.environ["KAMPUS_IMAGE_WEBP_QUALITY"] = "95"
        response_high = self.client.post(
            "/api/documents/",
            {
                "student": self.student.pk,
                "document_type": "PHOTO",
                "file": SimpleUploadedFile("detalle.png", png_bytes, content_type="image/png"),
            },
            format="multipart",
        )
        self.assertEqual(response_high.status_code, status.HTTP_201_CREATED)
        high_quality_doc = StudentDocument.objects.get(pk=response_high.data["id"])
        high_size = high_quality_doc.file.size

        self.assertGreater(high_size, low_size)
