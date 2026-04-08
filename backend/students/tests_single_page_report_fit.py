from unittest.mock import patch

from django.test import SimpleTestCase

from students.single_page_report_fit import fit_report_to_single_page


class SinglePageReportFitTests(SimpleTestCase):
    def test_short_report_stays_level_zero(self):
        context = {
            "rows": [
                {
                    "row_type": "SUBJECT",
                    "title": "Matematicas",
                    "lines": ["Buen desempeno general."],
                }
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", return_value=1):
            fitted = fit_report_to_single_page(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(fitted["report_fit"]["level"], "l0")
        self.assertEqual(len(fitted["rows"]), 1)

    def test_long_report_applies_progressive_compactation(self):
        context = {
            "rows": [
                {"row_type": "AREA", "title": "CIENCIAS NATURALES"},
                {
                    "row_type": "SUBJECT",
                    "title": "Biologia",
                    "lines": [
                        "a" * 240,
                        "b" * 240,
                        "c" * 240,
                        "d" * 240,
                        "e" * 240,
                        "f" * 240,
                    ],
                },
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=[2, 2, 1]):
            fitted = fit_report_to_single_page(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(fitted["report_fit"]["level"], "l2")
        self.assertTrue(fitted["report_fit"]["hide_rank"])
        self.assertEqual(len(fitted["rows"]), 1)
        self.assertEqual(fitted["rows"][0]["row_type"], "SUBJECT")
        self.assertLessEqual(len(fitted["rows"][0].get("lines") or []), 2)
        for line in fitted["rows"][0].get("lines") or []:
            self.assertLessEqual(len(line), 90)

    def test_extreme_fallback_keeps_single_page_policy(self):
        context = {
            "rows": [
                {
                    "row_type": "SUBJECT",
                    "title": f"Asignatura {idx}",
                    "lines": ["x" * 300],
                }
                for idx in range(40)
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", return_value=2):
            fitted = fit_report_to_single_page(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(fitted["report_fit"]["level"], "l2")
        self.assertTrue(fitted["report_fit"]["is_extreme"])
        self.assertLessEqual(len(fitted["rows"]), 23)

    def test_preschool_long_content_compacts(self):
        context = {
            "rows": [
                {"row_type": "SUBJECT", "title": "Dimension Cognitiva"},
                {
                    "row_type": "ACHIEVEMENT",
                    "description": "Texto muy largo " * 30,
                    "label": "ALTO",
                },
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=[2, 1]):
            fitted = fit_report_to_single_page(
                context,
                template_name="students/reports/academic_period_report_preschool_pdf.html",
                is_preschool=True,
            )

        self.assertEqual(fitted["report_fit"]["level"], "l1")
        achievement_rows = [r for r in fitted["rows"] if r.get("row_type") == "ACHIEVEMENT"]
        self.assertEqual(len(achievement_rows), 1)
        self.assertLessEqual(len(achievement_rows[0].get("description") or ""), 150)

    def test_fallback_when_pdf_measurement_is_unavailable(self):
        context = {
            "rows": [
                {
                    "row_type": "SUBJECT",
                    "title": f"Asignatura {idx}",
                    "lines": ["x" * 200 for _ in range(5)],
                }
                for idx in range(20)
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=RuntimeError("no-weasyprint")):
            fitted = fit_report_to_single_page(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(fitted["report_fit"]["level"], "l2")
        self.assertTrue(fitted["report_fit"]["hide_rank"])
