from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone

from academic.models import (
    AcademicLoad,
    AcademicYear,
    Area,
    Grade,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)
from attendance.models import AttendanceRecord, AttendanceSession
from students.models import Enrollment, Student
from users.models import User


class AttendanceKpiDashboardAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_kpi",
            password="pass123456",
            role=User.ROLE_ADMIN,
            first_name="Admin",
            last_name="KPI",
        )
        self.teacher_1 = User.objects.create_user(
            username="teacher_kpi_1",
            password="pass123456",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Uno",
        )
        self.teacher_2 = User.objects.create_user(
            username="teacher_kpi_2",
            password="pass123456",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Dos",
        )

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2025-01-01",
            end_date="2025-03-31",
            is_closed=False,
        )

        self.grade_1 = Grade.objects.create(name="1", ordinal=1)
        self.grade_2 = Grade.objects.create(name="2", ordinal=2)
        self.group_a = Group.objects.create(name="A", grade=self.grade_1, academic_year=self.year, capacity=40)
        self.group_b = Group.objects.create(name="B", grade=self.grade_2, academic_year=self.year, capacity=40)

        area_math = Area.objects.create(name="Matemáticas")
        area_lang = Area.objects.create(name="Lenguaje")
        subject_math = Subject.objects.create(name="Álgebra", area=area_math)
        subject_lang = Subject.objects.create(name="Lectura", area=area_lang)
        load_math = AcademicLoad.objects.create(subject=subject_math, grade=self.grade_1, weight_percentage=100, hours_per_week=4)
        load_lang = AcademicLoad.objects.create(subject=subject_lang, grade=self.grade_2, weight_percentage=100, hours_per_week=4)

        self.ta_1 = TeacherAssignment.objects.create(
            teacher=self.teacher_1,
            academic_load=load_math,
            group=self.group_a,
            academic_year=self.year,
        )
        self.ta_2 = TeacherAssignment.objects.create(
            teacher=self.teacher_2,
            academic_load=load_lang,
            group=self.group_b,
            academic_year=self.year,
        )

        self.enrollment_a_1 = self._create_enrollment("stud_a_1", "Ana", "A", self.group_a, self.grade_1)
        self.enrollment_a_2 = self._create_enrollment("stud_a_2", "Andrés", "A", self.group_a, self.grade_1)
        self.enrollment_b_1 = self._create_enrollment("stud_b_1", "Bea", "B", self.group_b, self.grade_2)
        self.enrollment_b_2 = self._create_enrollment("stud_b_2", "Bruno", "B", self.group_b, self.grade_2)

        session_a = AttendanceSession.objects.create(
            teacher_assignment=self.ta_1,
            period=self.period,
            class_date="2025-02-01",
            sequence=1,
            starts_at=timezone.now(),
            created_by=self.teacher_1,
        )
        session_b = AttendanceSession.objects.create(
            teacher_assignment=self.ta_2,
            period=self.period,
            class_date="2025-02-01",
            sequence=1,
            starts_at=timezone.now(),
            created_by=self.teacher_2,
        )

        AttendanceRecord.objects.create(session=session_a, enrollment=self.enrollment_a_1, status=AttendanceRecord.STATUS_ABSENT)
        AttendanceRecord.objects.create(session=session_a, enrollment=self.enrollment_a_2, status=AttendanceRecord.STATUS_PRESENT)
        AttendanceRecord.objects.create(session=session_b, enrollment=self.enrollment_b_1, status=AttendanceRecord.STATUS_PRESENT)
        AttendanceRecord.objects.create(session=session_b, enrollment=self.enrollment_b_2, status=AttendanceRecord.STATUS_PRESENT)

    def _create_enrollment(self, username: str, first_name: str, last_name: str, group: Group, grade: Grade) -> Enrollment:
        user = User.objects.create_user(
            username=username,
            password="pass123456",
            role=User.ROLE_STUDENT,
            first_name=first_name,
            last_name=last_name,
        )
        student = Student.objects.create(user=user, document_number=f"DOC-{username}")
        return Enrollment.objects.create(
            student=student,
            academic_year=self.year,
            grade=grade,
            group=group,
            status="ACTIVE",
        )

    def test_admin_gets_institutional_kpis(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            "/api/attendance/stats/kpi/?start_date=2025-02-01&end_date=2025-02-01",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["summary"]["total_records"], 4)
        self.assertEqual(res.data["summary"]["attendance_rate"], 75.0)
        self.assertEqual(res.data["summary"]["absence_rate"], 25.0)
        self.assertIn("summary_delta", res.data)
        self.assertIn("previous_summary", res.data)
        self.assertIn("previous_period", res.data)
        self.assertIn("previous_trend", res.data)
        self.assertEqual(len(res.data["group_comparison"]), 2)
        self.assertIn("attendance_rate_delta", res.data["group_comparison"][0])
        self.assertIn("previous_attendance_rate", res.data["trend"][0])
        self.assertIn("attendance_rate_delta", res.data["trend"][0])
        self.assertGreaterEqual(len(res.data["student_risk"]), 1)

    def test_filter_by_grade_limits_scope(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"/api/attendance/stats/kpi/?start_date=2025-02-01&end_date=2025-02-01&grade_id={self.grade_1.id}",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["summary"]["total_records"], 2)
        self.assertEqual(res.data["summary"]["absence_rate"], 50.0)
        self.assertEqual(len(res.data["group_comparison"]), 1)

    def test_group_comparison_excludes_blank_group_names(self):
        blank_group = Group.objects.create(name="", grade=self.grade_1, academic_year=self.year, capacity=40)
        blank_assignment = TeacherAssignment.objects.create(
            teacher=self.teacher_1,
            academic_load=self.ta_1.academic_load,
            group=blank_group,
            academic_year=self.year,
        )
        blank_enrollment = self._create_enrollment("stud_blank", "Blanca", "SinGrupo", blank_group, self.grade_1)

        blank_session = AttendanceSession.objects.create(
            teacher_assignment=blank_assignment,
            period=self.period,
            class_date="2025-02-01",
            sequence=2,
            starts_at=timezone.now(),
            created_by=self.teacher_1,
        )
        AttendanceRecord.objects.create(
            session=blank_session,
            enrollment=blank_enrollment,
            status=AttendanceRecord.STATUS_ABSENT,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            "/api/attendance/stats/kpi/?start_date=2025-02-01&end_date=2025-02-01",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["group_comparison"]), 2)
        self.assertTrue(all((row.get("group_name") or "").strip() for row in res.data["group_comparison"]))

    def test_teacher_only_sees_own_assignments(self):
        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.get(
            "/api/attendance/stats/kpi/?start_date=2025-02-01&end_date=2025-02-01",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["summary"]["total_records"], 2)
        self.assertEqual(res.data["summary"]["attendance_rate"], 50.0)
        self.assertEqual(len(res.data["group_comparison"]), 1)

    def test_admin_can_get_student_detail(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"/api/attendance/stats/kpi/student-detail/?enrollment_id={self.enrollment_a_1.id}&start_date=2025-02-01&end_date=2025-02-01",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["student"]["enrollment_id"], self.enrollment_a_1.id)
        self.assertEqual(res.data["summary"]["total_records"], 1)
        self.assertEqual(res.data["summary"]["absence_rate"], 100.0)
        self.assertEqual(len(res.data["by_subject"]), 1)
        self.assertEqual(res.data["by_subject"][0]["subject_name"], "Álgebra")
        self.assertEqual(res.data["by_subject"][0]["absence_rate"], 100.0)
        self.assertEqual(len(res.data["timeline"]), 1)

    def test_teacher_cannot_get_student_detail_from_other_group(self):
        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.get(
            f"/api/attendance/stats/kpi/student-detail/?enrollment_id={self.enrollment_b_1.id}&start_date=2025-02-01&end_date=2025-02-01",
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
