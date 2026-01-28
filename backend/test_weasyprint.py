from django.test import TestCase

from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html


class WeasyPrintSmokeTest(TestCase):
    def test_weasyprint_can_render_minimal_pdf(self):
        try:
            pdf_bytes = render_pdf_bytes_from_html(
                html="""
                    <html>
                      <head><meta charset='utf-8'></head>
                      <body><h1>OK</h1><p>WeasyPrint smoke test</p></body>
                    </html>
                """,
                base_url="/",
            )
        except WeasyPrintUnavailableError:
            self.skipTest("WeasyPrint no está disponible en este entorno (dependencias nativas faltantes).")

        self.assertIsInstance(pdf_bytes, (bytes, bytearray))
        self.assertGreater(len(pdf_bytes), 500)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
