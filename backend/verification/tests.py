from django.core.management import call_command
from django.test import TestCase
from django.test import override_settings
from django.core.cache import cache

from .models import VerifiableDocument
from .models import VerificationEvent


class PublicVerifyTests(TestCase):
    def test_api_verify_returns_json(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios", "student_full_name": "Ana"},
            seal_hash="abc123",
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("token"), doc.token)
        self.assertTrue(bool(data.get("valid")))
        self.assertEqual(data.get("doc_type"), VerifiableDocument.DocType.STUDY_CERTIFICATE)

    def test_api_verify_can_render_html(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="text/html")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res.get("Content-Type", ""))

    def test_api_verify_tolerates_percent_encoded_whitespace_in_path(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )

        # Simulates a URL copied from a PDF where spaces got inserted after `/api/`.
        res = self.client.get(f"/api/%20%20public/verify/{doc.token}/", follow=False)
        self.assertIn(res.status_code, {301, 308})
        self.assertEqual(res["Location"], f"/api/public/verify/{doc.token}/")

    def test_api_verify_strips_newlines_from_token(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )

        # Some QR scanner apps append a newline to the scanned URL.
        res = self.client.get(f"/api/public/verify/{doc.token}%0A/", follow=False)
        self.assertIn(res.status_code, {301, 308})
        self.assertEqual(res["Location"], f"/api/public/verify/{doc.token}/")

    def test_ui_verify_not_found(self):
        res = self.client.get("/public/verify/notfoundtoken/", HTTP_ACCEPT="text/html")
        self.assertEqual(res.status_code, 404)

    def test_revoked_is_invalid(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )
        doc.revoked_at = doc.issued_at
        doc.revoked_reason = "Duplicado"
        doc.save(update_fields=["revoked_at", "revoked_reason"])

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(bool(data.get("valid")))
        self.assertEqual(data.get("status"), VerifiableDocument.Status.REVOKED)

    @override_settings(PUBLIC_VERIFY_THROTTLE_RATE="2/min")
    def test_public_verify_throttles(self):
        cache.clear()
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )

        r1 = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(r2.status_code, 200)
        r3 = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(r3.status_code, 429)

    def test_public_verify_creates_audit_event(self):
        self.assertEqual(VerificationEvent.objects.count(), 0)

        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={"title": "Certificado de estudios"},
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)

        self.assertEqual(VerificationEvent.objects.count(), 1)
        evt = VerificationEvent.objects.first()
        self.assertEqual(evt.outcome, VerificationEvent.Outcome.VALID)
        self.assertEqual(evt.doc_type, VerifiableDocument.DocType.STUDY_CERTIFICATE)

    def test_public_payload_is_filtered_and_masks_document_number_json(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={
                "title": "Certificado de estudios",
                "student_full_name": "Ana Uno",
                "document_number": "12345678",
                "academic_year": "2026",
                "grade_name": "5",
                "secret": "should-not-leak",
            },
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        payload = data.get("public_payload") or {}

        self.assertEqual(payload.get("student_full_name"), "Ana Uno")
        self.assertEqual(payload.get("document_number"), "****5678")
        self.assertNotIn("secret", payload)

    def test_public_payload_masks_document_number_html(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={
                "title": "Certificado de estudios",
                "student_full_name": "Ana Uno",
                "document_number": "12345678",
            },
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="text/html")
        self.assertEqual(res.status_code, 200)
        body = res.content
        self.assertIn(b"****5678", body)
        self.assertNotIn(b"12345678", body)

    def test_study_certificate_can_expose_rows_and_final_status(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
            public_payload={
                "title": "Certificado de estudios",
                "student_full_name": "Ana Uno",
                "document_number": "12345678",
                "final_status": "APROBADO",
                "rows": [
                    {"area_subject": "Matemáticas", "hours_per_week": 4, "score": "3.80", "performance": "ALTO"},
                    {"area_subject": "Ciencias", "hours_per_week": "2", "score": "2.50", "performance": "BÁSICO", "secret": "x"},
                    "not-a-dict",
                ],
            },
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        payload = data.get("public_payload") or {}

        self.assertEqual(payload.get("final_status"), "APROBADO")
        self.assertEqual(payload.get("document_number"), "****5678")
        self.assertTrue(isinstance(payload.get("rows"), list))
        self.assertEqual(payload["rows"][0].get("area_subject"), "Matemáticas")
        self.assertNotIn("secret", payload["rows"][1])

        html = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="text/html")
        self.assertEqual(html.status_code, 200)
        body = html.content
        self.assertIn(b"SITUACI\xc3\x93N ACAD\xc3\x89MICA FINAL", body)
        self.assertIn(b"Matem\xc3\xa1ticas", body)

    def test_report_card_can_expose_rows_and_final_status(self):
        doc = VerifiableDocument.create_with_unique_token(
            doc_type=VerifiableDocument.DocType.REPORT_CARD,
            public_payload={
                "title": "Boletín / Informe académico: Ana Uno - Periodo 1 - 2026",
                "student_name": "Ana Uno",
                "group_name": "5A",
                "period_name": "Periodo 1",
                "year_name": "2026",
                "final_status": "APROBADO",
                "rows": [
                    {
                        "title": "Matemáticas",
                        "p1_score": "3.80",
                        "p2_score": "",
                        "p3_score": "",
                        "p4_score": "",
                        "final_score": "3.80",
                        "final_scale": "ALTO",
                        "lines": ["should-not-leak"],
                    },
                    "not-a-dict",
                ],
                "secret": "should-not-leak",
            },
        )

        res = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="application/json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        payload = data.get("public_payload") or {}

        self.assertEqual(payload.get("final_status"), "APROBADO")
        self.assertNotIn("secret", payload)
        self.assertTrue(isinstance(payload.get("rows"), list))
        self.assertEqual(payload["rows"][0].get("title"), "Matemáticas")
        self.assertNotIn("lines", payload["rows"][0])

        html = self.client.get(f"/api/public/verify/{doc.token}/", HTTP_ACCEPT="text/html")
        self.assertEqual(html.status_code, 200)
        body = html.content
        self.assertIn(b"SITUACI\xc3\x93N ACAD\xc3\x89MICA FINAL", body)
        self.assertIn(b"Matem\xc3\xa1ticas", body)


class BackfillCommandTests(TestCase):
    def test_backfill_creates_verifiable_document_for_issued_certificate(self):
        from students.models import CertificateIssue  # noqa: PLC0415

        issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            payload={
                "student_full_name": "Ana Uno",
                "document_number": "DOC-1",
                "academic_year": "2026",
                "grade_name": "5",
            },
            seal_hash="seal-1",
        )

        self.assertFalse(
            VerifiableDocument.objects.filter(
                doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
                object_type="CertificateIssue",
                object_id=str(issue.uuid),
            ).exists()
        )

        call_command("backfill_verifiable_documents", "--apply")

        self.assertTrue(
            VerifiableDocument.objects.filter(
                doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
                object_type="CertificateIssue",
                object_id=str(issue.uuid),
            ).exists()
        )
