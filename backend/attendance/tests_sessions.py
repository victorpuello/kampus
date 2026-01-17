from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from academic.models import AcademicYear, Grade, Group, Period, TeacherAssignment
from notifications.models import Notification
from users.models import User

from attendance.models import AttendanceSession


class AttendanceSessionConcurrencyRuleAPITest(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher_att",
            password="pass123456",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Asistencia",
        )

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2025-01-01",
            end_date="2025-03-31",
            is_closed=False,
        )

        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)
        self.ta = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=None,
            group=self.group,
            academic_year=self.year,
        )

        self.client.force_authenticate(user=self.teacher)

    def _create_session(self, *, client_uuid: str):
        return self.client.post(
            "/api/attendance/sessions/",
            {
                "teacher_assignment_id": self.ta.id,
                "period_id": self.period.id,
                "client_uuid": client_uuid,
            },
            format="json",
        )

    def test_teacher_cannot_create_two_sessions_within_30_minutes(self):
        r1 = self._create_session(client_uuid="11111111-1111-1111-1111-111111111111")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        r2 = self._create_session(client_uuid="22222222-2222-2222-2222-222222222222")
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("minutes_remaining", r2.data)

        self.assertEqual(AttendanceSession.objects.filter(locked_at__isnull=True).count(), 1)

    def test_after_30_minutes_new_session_auto_locks_previous(self):
        r1 = self._create_session(client_uuid="33333333-3333-3333-3333-333333333333")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)

        s1 = AttendanceSession.objects.get(id=r1.data["id"])
        s1.starts_at = timezone.now() - timedelta(minutes=31)
        s1.save(update_fields=["starts_at", "updated_at"])

        r2 = self._create_session(client_uuid="44444444-4444-4444-4444-444444444444")
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)

        s1.refresh_from_db()
        self.assertIsNotNone(s1.locked_at)
        self.assertEqual(AttendanceSession.objects.filter(locked_at__isnull=True).count(), 1)


class AttendanceSessionDeletionWorkflowAPITest(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher_del",
            password="pass123456",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Eliminar",
        )
        self.admin = User.objects.create_user(
            username="admin_del",
            password="pass123456",
            role=User.ROLE_ADMIN,
            first_name="Admin",
            last_name="Kampus",
        )

        self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2025-01-01",
            end_date="2025-03-31",
            is_closed=False,
        )
        self.grade = Grade.objects.create(name="1", ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=40)
        self.ta = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=None,
            group=self.group,
            academic_year=self.year,
        )

    def _create_session(self, *, client_uuid: str):
        self.client.force_authenticate(user=self.teacher)
        return self.client.post(
            "/api/attendance/sessions/",
            {
                "teacher_assignment_id": self.ta.id,
                "period_id": self.period.id,
                "client_uuid": client_uuid,
            },
            format="json",
        )

    def test_teacher_delete_creates_request_and_hides_session(self):
        r1 = self._create_session(client_uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        session_id = int(r1.data["id"])

        self.client.force_authenticate(user=self.teacher)
        rdel = self.client.delete(f"/api/attendance/sessions/{session_id}/")
        self.assertEqual(rdel.status_code, status.HTTP_202_ACCEPTED)

        s = AttendanceSession.objects.get(id=session_id)
        self.assertIsNotNone(s.deletion_requested_at)
        self.assertEqual(s.deletion_requested_by_id, self.teacher.id)
        self.assertIsNotNone(s.locked_at)

        # Teacher should not see it anymore in listing.
        rlist = self.client.get("/api/attendance/sessions/?page=1&page_size=50")
        self.assertEqual(rlist.status_code, status.HTTP_200_OK)
        ids = [int(it["id"]) for it in rlist.data.get("results", [])]
        self.assertNotIn(session_id, ids)

        # Admin should receive a notification.
        self.assertTrue(Notification.objects.filter(recipient=self.admin, type="ATTENDANCE_DELETE_REQUEST").exists())

    def test_admin_can_delete_only_if_requested(self):
        r1 = self._create_session(client_uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        session_id = int(r1.data["id"])

        # Admin cannot delete if there is no request.
        self.client.force_authenticate(user=self.admin)
        rdel1 = self.client.delete(f"/api/attendance/sessions/{session_id}/")
        self.assertEqual(rdel1.status_code, status.HTTP_400_BAD_REQUEST)

        # Teacher requests deletion.
        self.client.force_authenticate(user=self.teacher)
        rreq = self.client.delete(f"/api/attendance/sessions/{session_id}/")
        self.assertEqual(rreq.status_code, status.HTTP_202_ACCEPTED)

        # Admin now can delete definitively.
        self.client.force_authenticate(user=self.admin)
        rdel2 = self.client.delete(f"/api/attendance/sessions/{session_id}/")
        self.assertEqual(rdel2.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AttendanceSession.objects.filter(id=session_id).exists())

    def test_admin_can_list_pending_deletion(self):
        r1 = self._create_session(client_uuid="cccccccc-cccc-cccc-cccc-cccccccccccc")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        session_id = int(r1.data["id"])

        self.client.force_authenticate(user=self.teacher)
        rreq = self.client.delete(f"/api/attendance/sessions/{session_id}/")
        self.assertEqual(rreq.status_code, status.HTTP_202_ACCEPTED)

        self.client.force_authenticate(user=self.admin)
        rpend = self.client.get("/api/attendance/sessions/pending-deletion/?page=1&page_size=50")
        self.assertEqual(rpend.status_code, status.HTTP_200_OK)
        ids = [int(it["id"]) for it in rpend.data.get("results", [])]
        self.assertIn(session_id, ids)
