from django.test import TestCase
from academic.models import AchievementDefinition


class AcademicYearEnrollmentStatusTest(TestCase):
    def test_auto_closing_year_retires_enrollments(self):
        from academic.models import AcademicYear, Grade, Group
        from students.models import Enrollment, Student
        from users.models import User

        y2025 = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        grade = Grade.objects.create(name="1", ordinal=1)
        group = Group.objects.create(name="A", grade=grade, academic_year=y2025, capacity=40)

        u = User.objects.create_user(
            username="student_ay",
            password="pw123456",
            first_name="Ana",
            last_name="Diaz",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        s = Student.objects.create(user=u, document_number="DOC_AY")
        enr = Enrollment.objects.create(student=s, academic_year=y2025, grade=grade, group=group, status="ACTIVE")

        y2026 = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_PLANNING)
        y2026.status = AcademicYear.STATUS_ACTIVE
        y2026.save()

        y2025.refresh_from_db()
        enr.refresh_from_db()

        self.assertEqual(y2025.status, AcademicYear.STATUS_CLOSED)
        self.assertEqual(enr.status, "RETIRED")

class AchievementDefinitionModelTest(TestCase):
    def test_code_auto_generation(self):
        # Create a definition without code
        def1 = AchievementDefinition.objects.create(description="Test Achievement 1")
        self.assertTrue(def1.code.startswith("LOG-"))
        self.assertEqual(def1.code, f"LOG-{def1.id:04d}")

        # Create another one
        def2 = AchievementDefinition.objects.create(description="Test Achievement 2")
        self.assertTrue(def2.code.startswith("LOG-"))
        self.assertNotEqual(def1.code, def2.code)
        self.assertEqual(def2.code, f"LOG-{def2.id:04d}")

    def test_code_manual_assignment(self):
        # Create a definition with manual code (should be preserved if logic allows, 
        # but my logic overrides if not self.code. If self.code is present, it keeps it.)
        def3 = AchievementDefinition.objects.create(code="MANUAL-001", description="Manual Code")
        self.assertEqual(def3.code, "MANUAL-001")
