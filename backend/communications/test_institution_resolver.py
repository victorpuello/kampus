from django.contrib.auth import get_user_model
from django.test import TestCase

from academic.models import AcademicYear, Grade
from communications.institution_resolver import resolve_institution_for_user
from core.models import Campus, Institution
from students.models import Enrollment, FamilyMember, Student


User = get_user_model()


class ResolveInstitutionForUserTests(TestCase):
    def setUp(self):
        self.year = AcademicYear.objects.create(year=2030, status=AcademicYear.STATUS_ACTIVE)
        self.grade = Grade.objects.create(name="5", ordinal=5)

    def _create_campus(self, *, institution: Institution, name: str = "Sede Principal", director=None) -> Campus:
        return Campus.objects.create(
            institution=institution,
            name=name,
            director=director,
        )

    def test_resolves_from_institution_role_first(self):
        rector_user = User.objects.create_user(
            username="rector_resolver",
            email="rector.resolver@example.com",
            password="pass1234",
            role=User.ROLE_ADMIN,
        )
        primary = Institution.objects.create(name="Institucion Principal", rector=rector_user)
        secondary = Institution.objects.create(name="Institucion Secundaria")
        self._create_campus(institution=secondary, director=rector_user, name="Sede Secundaria")

        resolved = resolve_institution_for_user(rector_user)

        self.assertEqual(resolved.id, primary.id)

    def test_resolves_from_active_student_enrollment(self):
        student_user = User.objects.create_user(
            username="student_resolver",
            email="student.resolver@example.com",
            password="pass1234",
            role=User.ROLE_STUDENT,
        )
        student = Student.objects.create(user=student_user)
        institution = Institution.objects.create(name="Institucion Estudiante")
        campus = self._create_campus(institution=institution, name="Sede Estudiante")

        Enrollment.objects.create(
            student=student,
            academic_year=self.year,
            grade=self.grade,
            campus=campus,
            status="ACTIVE",
        )

        resolved = resolve_institution_for_user(student_user)

        self.assertEqual(resolved.id, institution.id)

    def test_resolves_from_family_member_student_enrollment(self):
        guardian_user = User.objects.create_user(
            username="guardian_resolver",
            email="guardian.resolver@example.com",
            password="pass1234",
            role=User.ROLE_PARENT,
        )
        student_user = User.objects.create_user(
            username="student_family_resolver",
            email="student.family.resolver@example.com",
            password="pass1234",
            role=User.ROLE_STUDENT,
        )
        student = Student.objects.create(user=student_user)
        FamilyMember.objects.create(
            student=student,
            user=guardian_user,
            full_name="Acudiente",
            relationship="Madre",
        )

        institution = Institution.objects.create(name="Institucion Familiar")
        campus = self._create_campus(institution=institution, name="Sede Familiar")
        Enrollment.objects.create(
            student=student,
            academic_year=self.year,
            grade=self.grade,
            campus=campus,
            status="ACTIVE",
        )

        resolved = resolve_institution_for_user(guardian_user)

        self.assertEqual(resolved.id, institution.id)
