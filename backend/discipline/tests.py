from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from academic.models import AcademicYear, Grade, Group
from core.models import Campus, Institution
from notifications.models import Notification
from students.models import Enrollment, FamilyMember, Student

from audit.models import AuditLog

from discipline.models import DisciplineCase, DisciplineCaseEvent, DisciplineCaseNotificationLog
from discipline.sealing import compute_case_seal_hash


class DisciplineCaseApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		User = get_user_model()

		self.institution = Institution.objects.create(name="Institución 1")
		self.campus = Campus.objects.create(institution=self.institution, name="Sede 1")
		self.year = AcademicYear.objects.create(year=2025, status=AcademicYear.STATUS_ACTIVE)
		self.grade = Grade.objects.create(name="10")

		self.teacher = User.objects.create_user(
			username="t1",
			password="pass",
			role="TEACHER",
			email="t1@example.com",
		)
		self.other_teacher = User.objects.create_user(
			username="t2",
			password="pass",
			role="TEACHER",
			email="t2@example.com",
		)

		self.group = Group.objects.create(
			name="A",
			grade=self.grade,
			campus=self.campus,
			academic_year=self.year,
			director=self.teacher,
		)
		self.other_group = Group.objects.create(
			name="B",
			grade=self.grade,
			campus=self.campus,
			academic_year=self.year,
			director=self.other_teacher,
		)

		self.student_user = User.objects.create_user(
			username="s1",
			password="pass",
			role="STUDENT",
			email="s1@example.com",
			first_name="Juan",
			last_name="Pérez",
		)
		self.student = Student.objects.create(user=self.student_user, document_number="100")

		self.other_student_user = User.objects.create_user(
			username="s2",
			password="pass",
			role="STUDENT",
			email="s2@example.com",
			first_name="Ana",
			last_name="Gómez",
		)
		self.other_student = Student.objects.create(user=self.other_student_user, document_number="101")

		self.enrollment = Enrollment.objects.create(
			student=self.student,
			academic_year=self.year,
			grade=self.grade,
			group=self.group,
			campus=self.campus,
			status="ACTIVE",
		)
		self.other_enrollment = Enrollment.objects.create(
			student=self.other_student,
			academic_year=self.year,
			grade=self.grade,
			group=self.other_group,
			campus=self.campus,
			status="ACTIVE",
		)

	def test_teacher_can_create_case_for_directed_group(self):
		self.client.force_authenticate(user=self.teacher)
		resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(resp.status_code, 201, resp.data)

	def test_teacher_cannot_create_case_for_non_directed_group(self):
		self.client.force_authenticate(user=self.teacher)
		resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.other_enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Patio",
				"narrative": "Descripción.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(resp.status_code, 400, resp.data)

	def test_decide_requires_descargos(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		decide_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/decide/",
			data={"decision_text": "Medida pedagógica."},
			format="json",
		)
		self.assertEqual(decide_resp.status_code, 400, decide_resp.data)

		descargos_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/record_descargos/",
			data={"text": "Versión libre."},
			format="multipart",
		)
		self.assertEqual(descargos_resp.status_code, 200, descargos_resp.data)

		decide_resp2 = self.client.post(
			f"/api/discipline/cases/{case_id}/decide/",
			data={"decision_text": "Medida pedagógica."},
			format="json",
		)
		self.assertEqual(decide_resp2.status_code, 200, decide_resp2.data)

	def test_notify_guardian_creates_log_and_in_app_notification(self):
		User = get_user_model()
		guardian_user = User.objects.create_user(
			username="p1",
			password="pass",
			role="PARENT",
			email="p1@example.com",
			first_name="María",
			last_name="Pérez",
		)
		FamilyMember.objects.create(
			student=self.student,
			user=guardian_user,
			full_name="María Pérez",
			relationship="Madre",
			email="p1@example.com",
			is_main_guardian=True,
		)

		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		notify_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/notify_guardian/",
			data={"channel": "IN_APP", "note": "Se informa apertura del caso."},
			format="json",
		)
		self.assertEqual(notify_resp.status_code, 200, notify_resp.data)

		self.assertTrue(
			DisciplineCaseNotificationLog.objects.filter(case_id=case_id).exists()
		)
		log = DisciplineCaseNotificationLog.objects.filter(case_id=case_id).first()
		self.assertIsNotNone(log)
		self.assertEqual(log.recipient_user_id, guardian_user.id)
		self.assertEqual(log.status, DisciplineCaseNotificationLog.Status.SENT)

		self.assertTrue(
			Notification.objects.filter(recipient=guardian_user, type="DISCIPLINE_CASE").exists()
		)

	def test_default_descargos_deadline_is_set_on_create(self):
		self.client.force_authenticate(user=self.teacher)
		resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(resp.status_code, 201, resp.data)

		case_id = resp.data["id"]
		detail = self.client.get(f"/api/discipline/cases/{case_id}/")
		self.assertEqual(detail.status_code, 200, detail.data)
		self.assertIsNotNone(detail.data.get("descargos_due_at"))

	def test_set_descargos_deadline_action(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		due = timezone.now() + timedelta(days=5)
		set_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/set_descargos_deadline/",
			data={"descargos_due_at": due.isoformat()},
			format="json",
		)
		self.assertEqual(set_resp.status_code, 200, set_resp.data)

		detail = self.client.get(f"/api/discipline/cases/{case_id}/")
		self.assertEqual(detail.status_code, 200, detail.data)
		self.assertIsNotNone(detail.data.get("descargos_due_at"))

	def test_notify_descargos_deadlines_command_due_soon_and_dedupes(self):
		User = get_user_model()
		coord = User.objects.create_user(
			username="coord1",
			password="pass",
			role="COORDINATOR",
			email="coord1@example.com",
		)

		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		case = DisciplineCase.objects.get(pk=case_id)
		case.descargos_due_at = timezone.now() + timedelta(hours=10)
		case.save(update_fields=["descargos_due_at"])

		call_command("notify_descargos_deadlines", hours_before=24)
		self.assertTrue(
			Notification.objects.filter(recipient=self.teacher, title="Descargos por vencer").exists()
		)
		self.assertTrue(
			Notification.objects.filter(recipient=coord, title="Descargos por vencer").exists()
		)

		# Deduplication within the command window
		call_command("notify_descargos_deadlines", hours_before=24)
		self.assertEqual(
			Notification.objects.filter(recipient=self.teacher, title="Descargos por vencer").count(),
			1,
		)
		self.assertEqual(
			Notification.objects.filter(recipient=coord, title="Descargos por vencer").count(),
			1,
		)

	def test_notify_descargos_deadlines_command_overdue_excludes_if_descargos_exist(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		case = DisciplineCase.objects.get(pk=case_id)
		case.descargos_due_at = timezone.now() - timedelta(hours=2)
		case.save(update_fields=["descargos_due_at"])

		call_command("notify_descargos_deadlines", hours_before=24)
		self.assertTrue(
			Notification.objects.filter(recipient=self.teacher, title="Descargos vencidos").exists()
		)

		# If descargos already exist, command should not notify again
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.DESCARGOS,
			text="Versión libre.",
			created_by=self.teacher,
		)
		Notification.objects.all().delete()
		call_command("notify_descargos_deadlines", hours_before=24)
		self.assertFalse(
			Notification.objects.filter(recipient=self.teacher, title="Descargos vencidos").exists()
		)

	def test_audit_log_created_on_case_view_and_acta_download(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		resp = self.client.get(f"/api/discipline/cases/{case_id}/")
		self.assertEqual(resp.status_code, 200, resp.data)
		self.assertTrue(
			AuditLog.objects.filter(
				actor=self.teacher,
				event_type="DISCIPLINE_CASE_VIEW",
				object_type="discipline_case",
				object_id=str(case_id),
			).exists()
		)

		acta = self.client.get(f"/api/discipline/cases/{case_id}/acta/")
		self.assertEqual(acta.status_code, 200)
		self.assertTrue(
			AuditLog.objects.filter(
				actor=self.teacher,
				event_type="DISCIPLINE_CASE_ACTA_DOWNLOAD",
				object_type="discipline_case",
				object_id=str(case_id),
			).exists()
		)

	def test_audit_log_list_is_admin_only(self):
		# teacher cannot list audit logs
		self.client.force_authenticate(user=self.teacher)
		resp = self.client.get("/api/audit-logs/")
		self.assertEqual(resp.status_code, 403)

		# admin can list audit logs
		User = get_user_model()
		admin_user = User.objects.create_user(
			username="a1",
			password="pass",
			role="ADMIN",
			email="a1@example.com",
		)
		self.client.force_authenticate(user=admin_user)
		resp2 = self.client.get("/api/audit-logs/")
		self.assertEqual(resp2.status_code, 200)

	def test_close_seals_case_and_sets_hash(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		close_resp = self.client.post(f"/api/discipline/cases/{case_id}/close/", data={}, format="json")
		self.assertEqual(close_resp.status_code, 200, close_resp.data)

		case = DisciplineCase.objects.get(pk=case_id)
		self.assertIsNotNone(case.sealed_at)
		self.assertEqual(case.sealed_by_id, self.teacher.id)
		self.assertTrue(isinstance(case.sealed_hash, str) and len(case.sealed_hash) == 64)

	def test_sealed_case_blocks_mutations_but_allows_add_note(self):
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Descripción objetiva.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		close_resp = self.client.post(f"/api/discipline/cases/{case_id}/close/", data={}, format="json")
		self.assertEqual(close_resp.status_code, 200, close_resp.data)

		case = DisciplineCase.objects.get(pk=case_id)
		sealed_hash_before = case.sealed_hash

		# PATCH should be blocked
		patch_resp = self.client.patch(
			f"/api/discipline/cases/{case_id}/",
			data={"location": "Otro lugar"},
			format="json",
		)
		self.assertEqual(patch_resp.status_code, 403, patch_resp.data)

		# Actions that mutate should be blocked
		due = timezone.now() + timedelta(days=2)
		deadline_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/set_descargos_deadline/",
			data={"descargos_due_at": due.isoformat()},
			format="json",
		)
		self.assertEqual(deadline_resp.status_code, 403, deadline_resp.data)

		# add_note is allowed
		note_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/add-note/",
			data={"text": "Nota aclaratoria posterior al cierre."},
			format="json",
		)
		self.assertEqual(note_resp.status_code, 200, note_resp.data)
		self.assertTrue(
			DisciplineCaseEvent.objects.filter(case_id=case_id, event_type=DisciplineCaseEvent.Type.NOTE).exists()
		)

		case.refresh_from_db()
		self.assertEqual(case.sealed_hash, sealed_hash_before)
		self.assertEqual(compute_case_seal_hash(case), sealed_hash_before)

	def test_parent_can_list_and_view_only_their_child_cases(self):
		User = get_user_model()
		parent = User.objects.create_user(
			username="p_parent",
			password="pass",
			role="PARENT",
			email="p_parent@example.com",
		)
		FamilyMember.objects.create(
			student=self.student,
			user=parent,
			full_name="Acudiente Uno",
			relationship="Madre",
			is_main_guardian=True,
		)

		# Create a case for this student
		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Caso del estudiante 1.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		# Create another case for a different student (by the teacher who directs that group)
		self.client.force_authenticate(user=self.other_teacher)
		create_resp2 = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.other_enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Patio",
				"narrative": "Caso del estudiante 2.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp2.status_code, 201, create_resp2.data)

		# Parent should only see their child's case
		self.client.force_authenticate(user=parent)
		list_resp = self.client.get("/api/discipline/cases/")
		self.assertEqual(list_resp.status_code, 200)
		ids = [c["id"] for c in list_resp.data]
		self.assertIn(case_id, ids)
		self.assertEqual(len(ids), 1)

		detail_resp = self.client.get(f"/api/discipline/cases/{case_id}/")
		self.assertEqual(detail_resp.status_code, 200, detail_resp.data)

	def test_parent_cannot_create_case(self):
		User = get_user_model()
		parent = User.objects.create_user(
			username="p2",
			password="pass",
			role="PARENT",
			email="p2@example.com",
		)
		self.client.force_authenticate(user=parent)
		resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "No debería poder.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(resp.status_code, 403, resp.data)

	def test_parent_can_acknowledge_only_own_notification_log(self):
		User = get_user_model()
		parent = User.objects.create_user(
			username="p3",
			password="pass",
			role="PARENT",
			email="p3@example.com",
		)
		other_parent = User.objects.create_user(
			username="p4",
			password="pass",
			role="PARENT",
			email="p4@example.com",
		)
		FamilyMember.objects.create(
			student=self.student,
			user=parent,
			full_name="Acudiente Uno",
			relationship="Madre",
			is_main_guardian=True,
		)

		self.client.force_authenticate(user=self.teacher)
		create_resp = self.client.post(
			"/api/discipline/cases/",
			data={
				"enrollment_id": self.enrollment.id,
				"occurred_at": timezone.now().isoformat(),
				"location": "Salón",
				"narrative": "Caso con notificación.",
				"manual_severity": "MINOR",
				"law_1620_type": "I",
			},
			format="json",
		)
		self.assertEqual(create_resp.status_code, 201, create_resp.data)
		case_id = create_resp.data["id"]

		notify_resp = self.client.post(
			f"/api/discipline/cases/{case_id}/notify_guardian/",
			data={"channel": "IN_APP", "note": "Se informa."},
			format="json",
		)
		self.assertEqual(notify_resp.status_code, 200, notify_resp.data)
		log_id = notify_resp.data["logs_created"][0]

		# Other parent cannot acknowledge
		self.client.force_authenticate(user=other_parent)
		bad_ack = self.client.post(
			f"/api/discipline/cases/{case_id}/acknowledge_guardian/",
			data={"log_id": log_id, "note": "enterado"},
			format="json",
		)
		self.assertEqual(bad_ack.status_code, 404, bad_ack.data)

		# Correct parent can acknowledge
		self.client.force_authenticate(user=parent)
		ok_ack = self.client.post(
			f"/api/discipline/cases/{case_id}/acknowledge_guardian/",
			data={"log_id": log_id, "note": "enterado"},
			format="json",
		)
		self.assertEqual(ok_ack.status_code, 200, ok_ack.data)
