from django.test import TestCase


class WeasyPrintSmokeTest(TestCase):
    def test_weasyprint_can_render_minimal_pdf(self):
        from weasyprint import HTML  # noqa: PLC0415

        pdf_bytes = HTML(
            string="""
                <html>
                  <head><meta charset='utf-8'></head>
                  <body><h1>OK</h1><p>WeasyPrint smoke test</p></body>
                </html>
            """,
            base_url="/",
        ).write_pdf()

        self.assertIsInstance(pdf_bytes, (bytes, bytearray))
        self.assertGreater(len(pdf_bytes), 500)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
