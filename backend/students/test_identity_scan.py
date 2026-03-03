from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class IdentityScanEndpointsAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_identity_scan",
            password="admin123",
            email="admin_identity_scan@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.parent = User.objects.create_user(
            username="parent_identity_scan",
            password="parent123",
            role=getattr(User, "ROLE_PARENT", "PARENT"),
        )

    def _make_image_upload(self, name: str, color: tuple[int, int, int]) -> SimpleUploadedFile:
        image = Image.new("RGB", (800, 500), color=color)
        buffer = BytesIO()
        image.save(buffer, format="JPEG")
        return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")

    def test_preview_returns_processed_jpeg_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        upload = self._make_image_upload("front.jpg", (240, 240, 240))

        response = self.client.post("/api/identity-scans/preview/", {"image": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertTrue(len(response.content) > 100)

    def test_compose_returns_pdf_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        front_upload = self._make_image_upload("front.jpg", (245, 245, 245))
        back_upload = self._make_image_upload("back.jpg", (230, 230, 230))

        response = self.client.post(
            "/api/identity-scans/compose/",
            {"front_image": front_upload, "back_image": back_upload},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_preview_denies_parent_role(self):
        self.client.force_authenticate(user=self.parent)
        upload = self._make_image_upload("front.jpg", (240, 240, 240))

        response = self.client.post("/api/identity-scans/preview/", {"image": upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_compose_requires_both_images(self):
        self.client.force_authenticate(user=self.admin)
        front_upload = self._make_image_upload("front.jpg", (245, 245, 245))

        response = self.client.post(
            "/api/identity-scans/compose/",
            {"front_image": front_upload},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("front_image", str(response.data))

    def test_compose_denies_parent_role(self):
        self.client.force_authenticate(user=self.parent)
        front_upload = self._make_image_upload("front.jpg", (245, 245, 245))
        back_upload = self._make_image_upload("back.jpg", (230, 230, 230))

        response = self.client.post(
            "/api/identity-scans/compose/",
            {"front_image": front_upload, "back_image": back_upload},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_preview_rejects_non_image_extension(self):
        self.client.force_authenticate(user=self.admin)
        bad_upload = SimpleUploadedFile("nota.txt", b"hello", content_type="text/plain")

        response = self.client.post("/api/identity-scans/preview/", {"image": bad_upload}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("JPG", str(response.data))

    def test_compose_rejects_oversized_upload(self):
        self.client.force_authenticate(user=self.admin)
        large_bytes = b"\xff\xd8\xff" + (b"0" * (2 * 1024 * 1024))
        front_upload = SimpleUploadedFile("front.jpg", large_bytes, content_type="image/jpeg")
        back_upload = self._make_image_upload("back.jpg", (230, 230, 230))

        with patch.dict("os.environ", {"KAMPUS_IDENTITY_SCAN_MAX_MB": "1"}, clear=False):
            response = self.client.post(
                "/api/identity-scans/compose/",
                {"front_image": front_upload, "back_image": back_upload},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("tamaño máximo", str(response.data.get("detail", "")).lower())
