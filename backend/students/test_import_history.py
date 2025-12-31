from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academic.models import AcademicLevel, Grade
from students.models import Student, Enrollment


class ImportAcademicHistoryTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.admin = User.objects.create_superuser(
            username="superadmin",
            email="sa@example.com",
            password="pass",
            role=User.ROLE_SUPERADMIN,
        )

        student_user = User.objects.create_user(
            username="student1",
            password="pass",
            email="s1@example.com",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Uno",
        )
        self.student = Student.objects.create(user=student_user)

        level = AcademicLevel.objects.create(name="Secundaria", level_type="SECONDARY")
        self.grade = Grade.objects.create(name="Octavo", level=level, ordinal=10)

        self.client.force_authenticate(user=self.admin)

    def test_import_history_creates_enrollment_and_snapshot(self):
        resp = self.client.post(
            f"/api/students/{self.student.pk}/import-academic-history/",
            {
                "academic_year": 2023,
                "grade": self.grade.id,
                "origin_school": "Colegio Externo",
                "subjects": [
                    {"area": "Matemáticas", "subject": "Álgebra", "final_score": "4.20"},
                    {"area": "Ciencias", "subject": "Biología", "final_score": "2.50"},
                ],
            },
            format="json",
        )

        self.assertEqual(resp.status_code, 201)
        self.assertIn("enrollment_id", resp.data)
        self.assertEqual(resp.data["decision"], "CONDITIONAL")

        enr = Enrollment.objects.get(id=resp.data["enrollment_id"])
        self.assertEqual(enr.grade_id, self.grade.id)
        self.assertEqual(enr.final_status, "IMPORTADO (CONDITIONAL)")

        # Snapshot should exist
        snap = enr.promotion_snapshot
        self.assertEqual(snap.decision, "CONDITIONAL")
        self.assertEqual(snap.failed_areas_count, 1)
        self.assertEqual(snap.failed_subjects_count, 1)

    def test_import_history_reuses_enrollment_and_updates_snapshot(self):
        # First import: one failed subject => CONDITIONAL
        resp1 = self.client.post(
            f"/api/students/{self.student.pk}/import-academic-history/",
            {
                "academic_year": 2023,
                "grade": self.grade.id,
                "origin_school": "Colegio Externo",
                "subjects": [
                    {"area": "Matemáticas", "subject": "Álgebra", "final_score": "2.90"},
                    {"area": "Ciencias", "subject": "Biología", "final_score": "4.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, 201)
        enrollment_id = resp1.data["enrollment_id"]
        self.assertEqual(resp1.data["decision"], "CONDITIONAL")
        self.assertEqual(Enrollment.objects.filter(student=self.student, academic_year__year=2023).count(), 1)

        # Second import (same year): no failed subjects => PROMOTED, must reuse the same Enrollment
        resp2 = self.client.post(
            f"/api/students/{self.student.pk}/import-academic-history/",
            {
                "academic_year": 2023,
                "grade": self.grade.id,
                "origin_school": "Colegio Externo 2",
                "subjects": [
                    {"area": "Matemáticas", "subject": "Álgebra", "final_score": "4.50"},
                    {"area": "Ciencias", "subject": "Biología", "final_score": "4.00"},
                ],
            },
            format="json",
        )

        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(resp2.data["enrollment_id"], enrollment_id)
        self.assertEqual(resp2.data["decision"], "PROMOTED")
        self.assertEqual(Enrollment.objects.filter(student=self.student, academic_year__year=2023).count(), 1)

        enr = Enrollment.objects.get(id=enrollment_id)
        self.assertEqual(enr.final_status, "IMPORTADO (PROMOTED)")
        self.assertEqual(enr.origin_school, "Colegio Externo 2")
        self.assertEqual(enr.promotion_snapshot.decision, "PROMOTED")
        self.assertEqual(enr.promotion_snapshot.failed_subjects_count, 0)
