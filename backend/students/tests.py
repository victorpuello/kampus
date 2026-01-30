from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch
import uuid as py_uuid
from students.models import Student, Enrollment
from students.models import FamilyMember
from students.models import CertificateIssue
from students.serializers import StudentSerializer
from rest_framework.test import APITestCase
from rest_framework import status
from django.core.management import call_command
from academic.models import AcademicYear, Grade, Group
from academic.models import TeacherAssignment
from reports.models import ReportJob
from notifications.models import Notification
from audit.models import AuditLog

User = get_user_model()

class StudentSerializerTest(TestCase):
    def test_create_student(self):
        data = {
            "first_name": "Juan",
            "last_name": "Perez",
            "email": "",  # Empty email should be allowed
            "document_number": "123456789",
            "place_of_issue": "Bogota - Cundinamarca"
        }
        serializer = StudentSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        student = serializer.save()
        
        self.assertEqual(student.user.first_name, "Juan")
        self.assertEqual(student.user.last_name, "Perez")
        self.assertEqual(student.user.username, "juan.perez")
        self.assertIsNone(student.user.email)
        self.assertEqual(student.place_of_issue, "Bogota - Cundinamarca")

    def test_read_student(self):
        user = User.objects.create_user(username="maria.gomez", first_name="Maria", last_name="Gomez", email="maria@example.com", role=User.ROLE_STUDENT)
        student = Student.objects.create(user=user, document_number="987654321")
        
        serializer = StudentSerializer(student)
        data = serializer.data
        
        self.assertEqual(data['user']['username'], "maria.gomez")
        self.assertEqual(data['user']['first_name'], "Maria")
        self.assertEqual(data['user']['email'], "maria@example.com")
        self.assertEqual(data['document_number'], "987654321")


class StudentListPaginationAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin",
            password="admin123",
            email="admin@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        for i in range(30):
            user = User.objects.create_user(
                username=f"s{i}",
                password="pw123456",
                first_name=f"Nombre{i}",
                last_name=f"Apellido{i}",
                role=User.ROLE_STUDENT,
            )
            Student.objects.create(user=user, document_number=f"DOC{i:03d}")

    def test_students_list_is_paginated(self):
        res = self.client.get("/api/students/?page=1&page_size=10")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)
        self.assertEqual(len(res.data["results"]), 10)

    def test_students_list_can_exclude_active_enrollment_year(self):
        year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        grade = Grade.objects.create(name="1", ordinal=1)

        u1 = User.objects.create_user(
            username="enrolled_student",
            password="pw123456",
            first_name="A",
            last_name="Enrolled",
            role=User.ROLE_STUDENT,
        )
        s1 = Student.objects.create(user=u1, document_number="DOC_ENR")
        Enrollment.objects.create(
            student=s1,
            academic_year=year,
            grade=grade,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="not_enrolled_student",
            password="pw123456",
            first_name="B",
            last_name="Free",
            role=User.ROLE_STUDENT,
        )
        s2 = Student.objects.create(user=u2, document_number="DOC_FREE")

        res = self.client.get(f"/api/students/?exclude_active_enrollment_year={year.id}&page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.data.get("results", [])]
        self.assertNotIn(s1.user_id, ids)
        self.assertIn(s2.user_id, ids)

    def test_students_list_can_filter_by_current_enrollment_status_none(self):
        year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        grade = Grade.objects.create(name="1", ordinal=1)

        u1 = User.objects.create_user(
            username="status_active_student",
            password="pw123456",
            first_name="A",
            last_name="Active",
            role=User.ROLE_STUDENT,
        )
        s1 = Student.objects.create(user=u1, document_number="DOC_STATUS_ACTIVE")
        Enrollment.objects.create(
            student=s1,
            academic_year=year,
            grade=grade,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="status_none_student",
            password="pw123456",
            first_name="B",
            last_name="None",
            role=User.ROLE_STUDENT,
        )
        s2 = Student.objects.create(user=u2, document_number="DOC_STATUS_NONE")

        res = self.client.get("/api/students/?current_enrollment_status=NONE&page=1&page_size=200")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        self.assertTrue(isinstance(results, list))
        ids = [row["id"] for row in results]
        self.assertIn(s2.pk, ids)
        self.assertNotIn(s1.pk, ids)


class EnrollmentListPaginationAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_enr",
            password="admin123",
            email="admin_enr@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

    def test_enrollments_list_is_paginated(self):
        res = self.client.get("/api/enrollments/?page=1&page_size=10")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)


class EnrollmentPartialUpdateAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_patch",
            password="admin123",
            email="admin_patch@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade_a = Grade.objects.create(name="1", ordinal=1)
        self.grade_b = Grade.objects.create(name="2", ordinal=2)
        self.group_a = Group.objects.create(name="A", grade=self.grade_a, academic_year=self.year, capacity=40)
        self.group_b = Group.objects.create(name="B", grade=self.grade_b, academic_year=self.year, capacity=40)

        u = User.objects.create_user(
            username="student_patch",
            password="pw123456",
            first_name="Patch",
            last_name="Student",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_PATCH")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade_a,
            group=self.group_a,
            status="ACTIVE",
        )

    def test_patch_enrollment_can_change_grade_and_group_without_academic_year(self):
        res = self.client.patch(
            f"/api/enrollments/{self.enrollment.id}/",
            {"grade": self.grade_b.id, "group": self.group_b.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.enrollment.refresh_from_db()
        self.assertEqual(self.enrollment.grade_id, self.grade_b.id)
        self.assertEqual(self.enrollment.group_id, self.group_b.id)


class EnrollmentDeletePermissionsAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_delete_enr",
            password="admin123",
            email="admin_delete_enr@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.superadmin = User.objects.create_superuser(
            username="superadmin_delete_enr",
            password="admin123",
            email="superadmin_delete_enr@example.com",
            role=getattr(User, "ROLE_SUPERADMIN", "SUPERADMIN"),
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        u = User.objects.create_user(
            username="student_delete_enr",
            password="pw123456",
            first_name="Delete",
            last_name="Student",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_DELETE_ENR")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            status="ACTIVE",
        )

    def test_admin_cannot_delete_enrollment(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f"/api/enrollments/{self.enrollment.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Enrollment.objects.filter(id=self.enrollment.id).exists())

    def test_superadmin_can_delete_enrollment(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.delete(f"/api/enrollments/{self.enrollment.id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Enrollment.objects.filter(id=self.enrollment.id).exists())


class EnrollmentReportExportAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_report",
            password="admin123",
            email="admin_report@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        u = User.objects.create_user(
            username="student_report",
            password="pw123456",
            first_name="Juan",
            last_name="Perez",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_REPORT")
        Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

    def test_report_csv_downloads(self):
        res = self.client.get(f"/api/enrollments/report/?export=csv&year={self.year.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res["Content-Type"].startswith("text/csv"))
        content = res.content
        self.assertIn(b"Documento", content)
        self.assertIn(b"DOC_REPORT", content)

    def test_report_xlsx_downloads(self):
        res = self.client.get(f"/api/enrollments/report/?export=xlsx&year={self.year.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        # XLSX files start with PK (zip)
        self.assertTrue(res.content.startswith(b"PK"))


class NormalizeGraduatedUsersCommandTests(TestCase):
    def test_command_deactivates_only_graduated_without_active_enrollment(self):
        year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        grade = Grade.objects.create(name="1", ordinal=1)

        u1 = User.objects.create_user(
            username="graduated_only_student",
            password="pw123456",
            first_name="A",
            last_name="Grad",
            role=User.ROLE_STUDENT,
            is_active=True,
        )
        s1 = Student.objects.create(user=u1, document_number="DOC_GRAD_ONLY")
        Enrollment.objects.create(student=s1, academic_year=year, grade=grade, status="GRADUATED")

        # Simulate historical inconsistent data (graduated enrollment but user still active).
        User.objects.filter(pk=u1.pk).update(is_active=True)

        u2 = User.objects.create_user(
            username="active_student",
            password="pw123456",
            first_name="B",
            last_name="Active",
            role=User.ROLE_STUDENT,
            is_active=True,
        )
        s2 = Student.objects.create(user=u2, document_number="DOC_ACTIVE")
        Enrollment.objects.create(student=s2, academic_year=year, grade=grade, status="ACTIVE")

        call_command("normalize_graduated_users", "--apply", "--print", "0")

        u1.refresh_from_db()
        u2.refresh_from_db()
        self.assertFalse(u1.is_active)
        self.assertTrue(u2.is_active)


class CertificateIssuesListFiltersAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_cert_list",
            password="admin123",
            email="admin_cert_list@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        u1 = User.objects.create_user(
            username="student_cert_1",
            password="pw123456",
            first_name="Ana",
            last_name="Uno",
            role=User.ROLE_STUDENT,
        )
        self.student1 = Student.objects.create(user=u1, document_number="DOC_CERT_1")
        self.enrollment1 = Enrollment.objects.create(
            student=self.student1,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="student_cert_2",
            password="pw123456",
            first_name="Beto",
            last_name="Dos",
            role=User.ROLE_STUDENT,
        )
        self.student2 = Student.objects.create(user=u2, document_number="DOC_CERT_2")
        self.enrollment2 = Enrollment.objects.create(
            student=self.student2,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        self.issue1 = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            enrollment=self.enrollment1,
            payload={
                "student_full_name": "Ana Uno",
                "document_number": "DOC_CERT_1",
                "academic_year": "2025",
                "grade_name": "1",
            },
        )
        self.issue2 = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            enrollment=self.enrollment2,
            payload={
                "student_full_name": "Beto Dos",
                "document_number": "DOC_CERT_2",
                "academic_year": "2025",
                "grade_name": "1",
            },
        )

        # Manual issue without enrollment should not match student_id/enrollment_id filters.
        CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            enrollment=None,
            payload={
                "student_full_name": "Ana Uno",
                "document_number": "DOC_CERT_1",
                "academic_year": "2025",
                "grade_name": "1",
            },
        )

    def test_list_can_filter_by_student_id(self):
        res = self.client.get(
            f"/api/certificates/issues/?student_id={self.student1.pk}&certificate_type=STUDIES&limit=100"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        uuids = [row.get("uuid") for row in res.data.get("results", [])]
        self.assertIn(str(self.issue1.uuid), uuids)
        self.assertNotIn(str(self.issue2.uuid), uuids)

    def test_list_can_filter_by_enrollment_id(self):
        res = self.client.get(
            f"/api/certificates/issues/?enrollment_id={self.enrollment2.id}&certificate_type=STUDIES&limit=100"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        uuids = [row.get("uuid") for row in res.data.get("results", [])]
        self.assertIn(str(self.issue2.uuid), uuids)
        self.assertNotIn(str(self.issue1.uuid), uuids)


class EnrollmentMyForTeacherAPITest(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="t_my_enr",
            password="pw123456",
            first_name="Doc",
            last_name="Uno",
            role=User.ROLE_TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            username="t_my_enr_2",
            password="pw123456",
            first_name="Doc",
            last_name="Dos",
            role=User.ROLE_TEACHER,
        )
        self.admin = User.objects.create_superuser(
            username="admin_my_enr",
            password="admin123",
            email="admin_my_enr@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group_assigned = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)
        self.group_other = Group.objects.create(name="B", grade=self.grade, academic_year=self.year, capacity=40)

        # Teacher teaches group_assigned via TeacherAssignment
        TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=None,
            group=self.group_assigned,
            academic_year=self.year,
        )

        u1 = User.objects.create_user(
            username="student_my_1",
            password="pw123456",
            first_name="Juan",
            last_name="Perez",
            role=User.ROLE_STUDENT,
        )
        s1 = Student.objects.create(user=u1, document_number="DOC_MY_1")

        self.enr_assigned = Enrollment.objects.create(
            student=s1,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_assigned,
            status="ACTIVE",
        )

        # Past year enrollment for the same student (should be visible via include_all_years)
        self.year_past = AcademicYear.objects.create(year="2024", status="CLOSED")
        self.grade_past = Grade.objects.create(name="0", ordinal=0)
        self.group_past = Group.objects.create(name="A", grade=self.grade_past, academic_year=self.year_past, capacity=40)
        self.enr_assigned_past = Enrollment.objects.create(
            student=s1,
            academic_year=self.year_past,
            grade=self.grade_past,
            group=self.group_past,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="student_my_2",
            password="pw123456",
            first_name="Ana",
            last_name="Gomez",
            role=User.ROLE_STUDENT,
        )
        s2 = Student.objects.create(user=u2, document_number="DOC_MY_2")
        self.enr_other = Enrollment.objects.create(
            student=s2,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_other,
            status="ACTIVE",
        )

    def test_teacher_can_list_my_enrollments_for_assigned_group(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(f"/api/enrollments/my/?group_id={self.group_assigned.id}&page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        ids = [row.get("id") for row in results]
        self.assertIn(self.enr_assigned.id, ids)
        self.assertNotIn(self.enr_other.id, ids)

    def test_teacher_cannot_see_enrollments_from_unassigned_group(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(f"/api/enrollments/my/?group_id={self.group_other.id}&page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        self.assertEqual(len(results), 0)

    def test_teacher_can_filter_my_enrollments_by_student(self):
        self.client.force_authenticate(user=self.teacher)

        res = self.client.get(f"/api/enrollments/my/?student={self.enr_assigned.student_id}&page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        ids = [row.get("id") for row in results]
        self.assertIn(self.enr_assigned.id, ids)
        self.assertNotIn(self.enr_other.id, ids)

        res2 = self.client.get(f"/api/enrollments/my/?student={self.enr_other.student_id}&page=1&page_size=100")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        results2 = res2.data.get("results", [])
        ids2 = [row.get("id") for row in results2]
        self.assertNotIn(self.enr_assigned.id, ids2)
        self.assertNotIn(self.enr_other.id, ids2)

    def test_teacher_can_request_full_history_for_allowed_student(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(
            f"/api/enrollments/my/?student={self.enr_assigned.student_id}&include_all_years=true&page=1&page_size=100"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        ids = [row.get("id") for row in results]
        self.assertIn(self.enr_assigned.id, ids)
        self.assertIn(self.enr_assigned_past.id, ids)

    def test_teacher_cannot_request_full_history_for_unallowed_student(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(
            f"/api/enrollments/my/?student={self.enr_other.student_id}&include_all_years=true&page=1&page_size=100"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        self.assertEqual(len(results), 0)

    def test_non_teacher_forbidden(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/enrollments/my/?page=1&page_size=10")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class CertificateStudiesIssueAsyncAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_cert",
            password="admin123",
            email="admin_cert@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)

        u = User.objects.create_user(
            username="student_cert",
            password="pw123456",
            first_name="Ana",
            last_name="Diaz",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_CERT")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

    @patch("reports.tasks.generate_report_job_pdf.delay")
    def test_issue_certificate_async_creates_pending_issue_and_job(self, mock_delay):
        res = self.client.post(
            "/api/certificates/studies/issue/?async=1",
            {"enrollment_id": self.enrollment.id, "academic_year_id": self.year.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        mock_delay.assert_called_once()

        issue = CertificateIssue.objects.latest("issued_at")
        self.assertEqual(issue.status, CertificateIssue.STATUS_PENDING)

        job = ReportJob.objects.latest("created_at")
        self.assertEqual(job.report_type, ReportJob.ReportType.CERTIFICATE_STUDIES)
        self.assertEqual(job.params.get("certificate_uuid"), str(issue.uuid))


class CertificateIssueEditDeleteAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_cert_edit",
            password="admin123",
            email="admin_cert_edit@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

    def test_can_patch_pending_issue(self):
        issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_PENDING,
            amount_cop=10000,
            payload={
                "student_full_name": "Ana Diaz",
                "document_number": "DOC1",
                "academic_year": "2025",
                "grade_name": "1",
            },
        )

        res = self.client.patch(
            f"/api/certificates/issues/{issue.uuid}/",
            {"student_full_name": "Ana Maria Diaz", "amount_cop": 12000},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        issue.refresh_from_db()
        self.assertEqual(issue.status, CertificateIssue.STATUS_PENDING)
        self.assertEqual(issue.amount_cop, 12000)
        self.assertEqual((issue.payload or {}).get("student_full_name"), "Ana Maria Diaz")

    def test_cannot_patch_issued_issue(self):
        issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            amount_cop=10000,
            payload={"student_full_name": "Ana Diaz", "document_number": "DOC1"},
        )

        res = self.client.patch(
            f"/api/certificates/issues/{issue.uuid}/",
            {"student_full_name": "Cambio"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        issue.refresh_from_db()
        self.assertEqual(issue.status, CertificateIssue.STATUS_ISSUED)

    def test_delete_pending_issue_hard_deletes(self):
        issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_PENDING,
            payload={"student_full_name": "Ana"},
        )

        res = self.client.delete(f"/api/certificates/issues/{issue.uuid}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CertificateIssue.objects.filter(uuid=issue.uuid).exists())

    def test_delete_issued_issue_revokes(self):
        issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            payload={"student_full_name": "Ana"},
        )

        res = self.client.delete(
            f"/api/certificates/issues/{issue.uuid}/",
            {"reason": "Duplicado"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        issue.refresh_from_db()
        self.assertEqual(issue.status, CertificateIssue.STATUS_REVOKED)
        self.assertTrue(bool(issue.revoked_at))
        self.assertEqual(issue.revoke_reason, "Duplicado")


class PublicCertificateVerifyLegacyURLTests(TestCase):
    def test_legacy_uuid_redirects_to_canonical_public_url(self):
        issue = CertificateIssue.objects.create(
            uuid=py_uuid.UUID("c145af62-7293-41fc-b9ea-97898b80d383"),
            status=CertificateIssue.STATUS_ISSUED,
        )

        # Missing hyphen between 41fc and b9ea (common copy/paste issue)
        legacy = "c145af62-7293-41fcb9ea-97898b80d383"
        res = self.client.get(f"/public/certificates/{legacy}/", follow=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn(str(issue.uuid), res["Location"])

    def test_spacey_certificates_prefix_redirects_to_canonical_public_url(self):
        issue = CertificateIssue.objects.create(
            uuid=py_uuid.UUID("c145af62-7293-41fc-b9ea-97898b80d383"),
            status=CertificateIssue.STATUS_ISSUED,
        )

        legacy = "c145af62-7293-41fcb9ea-97898b80d383"

        # Some legacy QR codes ended up with leading spaces after /public/.
        res = self.client.get(f"/public/  certificates/{legacy}", follow=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn(str(issue.uuid), res["Location"])

        res2 = self.client.get(f"/public/  certificates/{legacy}/verify", follow=False)
        self.assertEqual(res2.status_code, 302)
        self.assertIn(str(issue.uuid), res2["Location"])


class StudentDirectorEditAPITest(APITestCase):
    def setUp(self):
        self.director = User.objects.create_user(
            username="t_director",
            password="pw123456",
            first_name="Dir",
            last_name="One",
            role=User.ROLE_TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            username="t_other",
            password="pw123456",
            first_name="Doc",
            last_name="Two",
            role=User.ROLE_TEACHER,
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            capacity=40,
            director=self.director,
        )

        u = User.objects.create_user(
            username="student_dir",
            password="pw123456",
            first_name="Juan",
            last_name="Perez",
            role=User.ROLE_STUDENT,
        )
        self.student = Student.objects.create(user=u, document_number="DOC_DIR")
        Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

    def test_director_teacher_can_patch_student(self):
        self.client.force_authenticate(user=self.director)
        res = self.client.patch(
            f"/api/students/{self.student.pk}/",
            {"address": "Calle 1", "first_name": "Carlos"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.student.user.refresh_from_db()
        self.assertEqual(self.student.address, "Calle 1")
        self.assertEqual(self.student.user.first_name, "Carlos")

    def test_non_director_teacher_cannot_patch_student(self):
        self.client.force_authenticate(user=self.other_teacher)
        res = self.client.patch(
            f"/api/students/{self.student.pk}/",
            {"address": "Calle X"},
            format="json",
        )
        # Teacher scope is filtered; for non-directed students it should behave as not found.
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_director_teacher_can_create_family_member(self):
        self.client.force_authenticate(user=self.director)
        res = self.client.post(
            "/api/family-members/",
            {
                "student": self.student.pk,
                "user": None,
                "full_name": "Maria Perez",
                "document_number": "CC123",
                "relationship": "MADRE",
                "phone": "3000000000",
                "email": "maria@example.com",
                "address": "Calle 1",
                "is_main_guardian": False,
                "is_head_of_household": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(FamilyMember.objects.filter(student=self.student, full_name="Maria Perez").exists())

    def test_non_director_teacher_cannot_create_family_member(self):
        self.client.force_authenticate(user=self.other_teacher)
        res = self.client.post(
            "/api/family-members/",
            {
                "student": self.student.pk,
                "full_name": "Maria Perez",
                "relationship": "MADRE",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class StudentDirectorVisibilityAPITest(APITestCase):
    def setUp(self):
        self.director = User.objects.create_user(
            username="t_director_vis",
            password="pw123456",
            first_name="Dir",
            last_name="Vis",
            role=User.ROLE_TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            username="t_other_vis",
            password="pw123456",
            first_name="Doc",
            last_name="Other",
            role=User.ROLE_TEACHER,
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)

        self.group_directed = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            capacity=40,
            director=self.director,
        )
        self.group_not_directed = Group.objects.create(
            name="B",
            grade=self.grade,
            academic_year=self.year,
            capacity=40,
            director=self.other_teacher,
        )

        u1 = User.objects.create_user(
            username="student_in_directed",
            password="pw123456",
            first_name="Juan",
            last_name="Directed",
            role=User.ROLE_STUDENT,
        )
        self.student_directed = Student.objects.create(user=u1, document_number="DOC_DIR_VIS")
        Enrollment.objects.create(
            student=self.student_directed,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_directed,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="student_not_directed",
            password="pw123456",
            first_name="Ana",
            last_name="Other",
            role=User.ROLE_STUDENT,
        )
        self.student_not_directed = Student.objects.create(user=u2, document_number="DOC_OTHER_VIS")
        Enrollment.objects.create(
            student=self.student_not_directed,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_not_directed,
            status="ACTIVE",
        )

    def test_director_teacher_list_only_directed_students(self):
        self.client.force_authenticate(user=self.director)
        res = self.client.get("/api/students/?page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.data.get("results", [])]
        self.assertIn(self.student_directed.pk, ids)
        self.assertNotIn(self.student_not_directed.pk, ids)

    def test_director_teacher_cannot_retrieve_non_directed_student(self):
        self.client.force_authenticate(user=self.director)
        res = self.client.get(f"/api/students/{self.student_not_directed.pk}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class StudentAssignedTeacherVisibilityAPITest(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="t_assigned_vis",
            password="pw123456",
            first_name="Doc",
            last_name="Asignado",
            role=User.ROLE_TEACHER,
        )

        self.other_teacher = User.objects.create_user(
            username="t_assigned_vis_2",
            password="pw123456",
            first_name="Doc",
            last_name="Otro",
            role=User.ROLE_TEACHER,
        )

        self.year = AcademicYear.objects.create(year="2025", status="ACTIVE")
        self.grade = Grade.objects.create(name="1", ordinal=1)

        self.group_assigned = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            capacity=40,
            director=self.other_teacher,
        )
        self.group_other = Group.objects.create(
            name="B",
            grade=self.grade,
            academic_year=self.year,
            capacity=40,
            director=self.other_teacher,
        )

        # Teacher teaches group_assigned via TeacherAssignment
        TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=None,
            group=self.group_assigned,
            academic_year=self.year,
        )

        u1 = User.objects.create_user(
            username="student_assigned_only",
            password="pw123456",
            first_name="Juan",
            last_name="Asignado",
            role=User.ROLE_STUDENT,
        )
        self.student_assigned = Student.objects.create(user=u1, document_number="DOC_ASSIGNED_ONLY")
        Enrollment.objects.create(
            student=self.student_assigned,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_assigned,
            status="ACTIVE",
        )

        u2 = User.objects.create_user(
            username="student_unassigned",
            password="pw123456",
            first_name="Ana",
            last_name="No",
            role=User.ROLE_STUDENT,
        )
        self.student_unassigned = Student.objects.create(user=u2, document_number="DOC_UNASSIGNED")
        Enrollment.objects.create(
            student=self.student_unassigned,
            academic_year=self.year,
            grade=self.grade,
            group=self.group_other,
            status="ACTIVE",
        )

    def test_assigned_teacher_list_is_empty_when_not_director(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get("/api/students/?page=1&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.data.get("results", [])]
        self.assertNotIn(self.student_assigned.pk, ids)
        self.assertNotIn(self.student_unassigned.pk, ids)

    def test_assigned_teacher_cannot_retrieve_assigned_student(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(f"/api/students/{self.student_assigned.pk}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_assigned_teacher_cannot_retrieve_unassigned_student(self):
        self.client.force_authenticate(user=self.teacher)
        res = self.client.get(f"/api/students/{self.student_unassigned.pk}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class PublicCertificateVerificationNotificationTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_verify",
            password="pw123456",
            first_name="Admin",
            last_name="Verify",
            email="admin_verify@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
            is_active=True,
        )

        self.issue = CertificateIssue.objects.create(
            certificate_type=CertificateIssue.TYPE_STUDIES,
            status=CertificateIssue.STATUS_ISSUED,
            payload={"student_full_name": "Estudiante X"},
        )

    def test_public_verify_ui_creates_notification_and_dedupes(self):
        url = f"/public/certificates/{self.issue.uuid}/"

        res1 = self.client.get(url, HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(
                event_type="PUBLIC_CERTIFICATE_VERIFY",
                object_type="CertificateIssue",
                object_id=str(self.issue.uuid),
            ).count(),
            1,
        )
        self.assertEqual(Notification.objects.filter(recipient=self.admin).count(), 1)

        res2 = self.client.get(url, HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(Notification.objects.filter(recipient=self.admin).count(), 1)

    def test_public_verify_api_uses_same_dedupe_key(self):
        ui_url = f"/public/certificates/{self.issue.uuid}/"
        api_url = f"/api/public/certificates/{self.issue.uuid}/verify/"

        res1 = self.client.get(ui_url, HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(Notification.objects.filter(recipient=self.admin).count(), 1)

        res2 = self.client.get(
            api_url,
            HTTP_ACCEPT="application/json",
            HTTP_USER_AGENT="pytest-agent",
            REMOTE_ADDR="1.2.3.4",
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(Notification.objects.filter(recipient=self.admin).count(), 1)
        self.assertEqual(
            AuditLog.objects.filter(
                event_type="PUBLIC_CERTIFICATE_VERIFY",
                object_type="CertificateIssue",
                object_id=str(self.issue.uuid),
            ).count(),
            2,
        )

    def test_public_verify_api_can_render_html_for_qr_scan(self):
        url = f"/api/public/certificates/{self.issue.uuid}/verify/"

        res = self.client.get(url, HTTP_ACCEPT="text/html", HTTP_USER_AGENT="pytest-agent")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res.get("Content-Type", ""))

    def test_public_verify_ui_not_found_is_audited(self):
        missing_uuid = py_uuid.uuid4()
        url = f"/public/certificates/{missing_uuid}/"

        res = self.client.get(url, HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res.status_code, 404)

        self.assertEqual(
            AuditLog.objects.filter(
                event_type="PUBLIC_CERTIFICATE_VERIFY",
                object_type="CertificateIssue",
                object_id=str(missing_uuid),
                status_code=404,
            ).count(),
            1,
        )
        self.assertEqual(Notification.objects.count(), 0)

    def test_public_verify_api_not_found_is_audited(self):
        missing_uuid = py_uuid.uuid4()
        url = f"/api/public/certificates/{missing_uuid}/verify/"

        res = self.client.get(url, HTTP_ACCEPT="application/json", HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res.status_code, 404)

        self.assertEqual(
            AuditLog.objects.filter(
                event_type="PUBLIC_CERTIFICATE_VERIFY",
                object_type="CertificateIssue",
                object_id=str(missing_uuid),
                status_code=404,
            ).count(),
            1,
        )
        self.assertEqual(Notification.objects.count(), 0)

    def test_public_verify_legacy_invalid_id_is_audited(self):
        bad = "not-a-uuid"
        url = f"/public/certificates/{bad}/"

        res = self.client.get(url, HTTP_USER_AGENT="pytest-agent", REMOTE_ADDR="1.2.3.4")
        self.assertEqual(res.status_code, 404)

        self.assertEqual(
            AuditLog.objects.filter(
                event_type="PUBLIC_CERTIFICATE_VERIFY",
                object_type="CertificateIssue",
                object_id=bad,
                status_code=404,
            ).count(),
            1,
        )
        self.assertEqual(Notification.objects.count(), 0)
