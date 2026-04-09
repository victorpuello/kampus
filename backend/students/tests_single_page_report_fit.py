from unittest.mock import patch

from django.test import SimpleTestCase

from students.single_page_report_fit import _split_index_balanced, layout_report_to_two_pages


class TwoPageReportLayoutTests(SimpleTestCase):
    def test_short_report_is_split_in_two_pages(self):
        context = {
            "rows": [
                {
                    "row_type": "SUBJECT",
                    "title": "Matematicas",
                    "lines": ["Buen desempeno general."],
                },
                {
                    "row_type": "SUBJECT",
                    "title": "Lenguaje",
                    "lines": ["Lectura y escritura."],
                },
            ]
        }

        with patch("students.single_page_report_fit._count_pdf_pages", return_value=2):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(laid_out["report_layout"]["profile"], "p0")
        self.assertTrue(laid_out["rows_page_1"])
        self.assertTrue(laid_out["rows_page_2"])

    def test_overflow_tries_next_profile_until_two_pages(self):
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

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=[3, 2]):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(laid_out["report_layout"]["profile"], "p1")
        self.assertGreaterEqual(len(laid_out["rows_page_1"]) + len(laid_out["rows_page_2"]), len(context["rows"]))

    def test_fallback_without_pdf_measurement_still_builds_two_page_layout(self):
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

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=RuntimeError("no-weasyprint")):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertIn("rows_page_1", laid_out)
        self.assertIn("rows_page_2", laid_out)
        self.assertTrue(laid_out["rows_page_1"])

    def test_preschool_layout_preserves_full_text(self):
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

        with patch("students.single_page_report_fit._count_pdf_pages", return_value=2):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_preschool_pdf.html",
                is_preschool=True,
            )

        combined = list(laid_out["rows_page_1"]) + list(laid_out["rows_page_2"])
        descriptions = [str(r.get("description") or "") for r in combined if r.get("row_type") == "ACHIEVEMENT"]
        self.assertTrue(any("Texto muy largo" in d for d in descriptions))

    def test_split_does_not_cut_inside_composite_area(self):
        rows = [
            {"row_type": "SUBJECT", "title": "Intro", "lines": []},
            {"row_type": "AREA", "title": "HUMANIDADES (AREA)"},
            {"row_type": "SUBJECT", "title": "Lengua", "is_single_area": False, "lines": ["x" * 10]},
            {"row_type": "SUBJECT", "title": "Lectura", "is_single_area": False, "lines": ["x" * 10]},
            {"row_type": "SUBJECT", "title": "Filosofia", "is_single_area": False, "lines": ["x" * 10]},
            {"row_type": "SUBJECT", "title": "Cierre", "lines": []},
        ]

        split_index = _split_index_balanced(rows=rows, target_ratio=0.50, is_preschool=False)

        # If the algorithm initially lands inside HUMANIDADES, it must move before AREA
        # so the complete composite block starts on page 2.
        self.assertEqual(split_index, 1)

    def test_split_avoids_single_block_on_second_page_when_possible(self):
        rows = [
            {"row_type": "SUBJECT", "title": "Bloque 1", "lines": ["x" * 60]},
            {"row_type": "SUBJECT", "title": "Bloque 2", "lines": ["x" * 60]},
            {"row_type": "SUBJECT", "title": "Bloque 3", "lines": ["x" * 60]},
            {"row_type": "AREA", "title": "HUMANIDADES (AREA)"},
            {"row_type": "SUBJECT", "title": "Lengua", "is_single_area": False, "lines": ["x" * 420]},
            {"row_type": "SUBJECT", "title": "Lectura", "is_single_area": False, "lines": ["x" * 420]},
        ]

        split_index = _split_index_balanced(rows=rows, target_ratio=0.50, is_preschool=False)

        # The second page should not start with only one academic block
        # when there are at least 4 blocks available.
        self.assertLess(split_index, 3)

    def test_profile_selection_uses_grouped_visual_measurement(self):
        context = {
            "rows": [
                {"row_type": "SUBJECT", "title": "Intro", "lines": ["x" * 20]},
                {"row_type": "AREA", "title": "HUMANIDADES (AREA)"},
                {"row_type": "SUBJECT", "title": "Lengua", "is_single_area": False, "lines": ["x" * 300]},
                {"row_type": "SUBJECT", "title": "Lectura", "is_single_area": False, "lines": ["x" * 300]},
                {"row_type": "SUBJECT", "title": "Ingles", "lines": ["x" * 20]},
            ]
        }

        def fake_page_count(*, template_name, context):
            profile = str((context.get("report_layout") or {}).get("profile") or "")
            has_grouped_area = any(
                isinstance(row, dict) and str(row.get("row_type") or "").upper() == "AREA_COMPOSITE"
                for row in (context.get("rows_page_1") or []) + (context.get("rows_page_2") or [])
            )

            if profile in {"p0", "p1"}:
                # If measurement is grouped, p0/p1 should still overflow.
                return 3 if has_grouped_area else 2
            return 2

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=fake_page_count):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(laid_out["report_layout"]["profile"], "p2")

    def test_exact_split_search_finds_two_pages_when_heuristic_misses(self):
        context = {
            "rows": [
                {"row_type": "SUBJECT", "title": f"Bloque {idx}", "lines": ["x" * 80]}
                for idx in range(1, 7)
            ]
        }

        def fake_page_count(*, template_name, context):
            profile = str((context.get("report_layout") or {}).get("profile") or "")
            split_size = len(context.get("rows_page_1") or [])

            if profile == "p2" and split_size == 2:
                return 2
            return 3

        with patch("students.single_page_report_fit._count_pdf_pages", side_effect=fake_page_count):
            laid_out = layout_report_to_two_pages(
                context,
                template_name="students/reports/academic_period_report_pdf.html",
                is_preschool=False,
            )

        self.assertEqual(laid_out["report_layout"]["profile"], "p2")
        self.assertEqual(len(laid_out["rows_page_1"]), 2)
