from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase, override_settings

from .weasyprint_utils import _rewrite_local_media_urls, weasyprint_url_fetcher


class WeasyPrintUrlFetcherTests(SimpleTestCase):
    def test_missing_media_image_returns_placeholder_bytes(self):
        with TemporaryDirectory() as tmp_media_root:
            with override_settings(MEDIA_URL="/media/", MEDIA_ROOT=tmp_media_root):
                response = weasyprint_url_fetcher("/media/institutions/letterheads/memebreteineplavi.png")

        self.assertEqual(response["mime_type"], "image/png")
        self.assertIn("string", response)
        self.assertTrue(response["string"].startswith(b"\x89PNG"))

    def test_missing_local_non_image_returns_empty_payload(self):
        with TemporaryDirectory() as tmp_media_root:
            with override_settings(MEDIA_URL="/media/", MEDIA_ROOT=tmp_media_root):
                response = weasyprint_url_fetcher("/media/docs/missing.txt")

        self.assertEqual(response["mime_type"], "text/plain")
        self.assertEqual(response["string"], b"")

    def test_existing_media_file_is_opened_normally(self):
        with TemporaryDirectory() as tmp_media_root:
            rel = Path("institutions/letterheads/ok.txt")
            full = Path(tmp_media_root) / rel
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_bytes(b"ok")

            with override_settings(MEDIA_URL="/media/", MEDIA_ROOT=tmp_media_root):
                response = weasyprint_url_fetcher(f"/media/{rel.as_posix()}")

        self.assertEqual(response["mime_type"], "text/plain")
        self.assertIn("filename", response)
        self.assertTrue(str(response["filename"]).endswith("institutions/letterheads/ok.txt"))

    def test_rewrite_media_url_to_file_uri_when_exists(self):
        with TemporaryDirectory() as tmp_media_root:
            rel = Path("institutions/letterheads/ok.png")
            full = Path(tmp_media_root) / rel
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_bytes(b"fake")

            with override_settings(MEDIA_URL="/media/", MEDIA_ROOT=tmp_media_root):
                rewritten = _rewrite_local_media_urls(f'<img src="/media/{rel.as_posix()}">')

        self.assertIn("file://", rewritten)
        self.assertNotIn(f"/media/{rel.as_posix()}", rewritten)

    def test_rewrite_missing_media_image_to_data_uri(self):
        with TemporaryDirectory() as tmp_media_root:
            with override_settings(MEDIA_URL="/media/", MEDIA_ROOT=tmp_media_root):
                rewritten = _rewrite_local_media_urls('<img src="/media/institutions/letterheads/missing.png">')

        self.assertIn("data:image/png;base64,", rewritten)
