from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch
from rest_framework.test import APITestCase
from rest_framework import status

from students.models import Student
from core.models import Institution, Campus
from academic.models import AcademicYear, AcademicLevel, Grade, Group
from students.models import Enrollment
from .models import NoveltyType, NoveltyReason, NoveltyCase, NoveltyRequiredDocumentRule, CapacityBucket
from notifications.models import Notification


User = get_user_model()


class NoveltiesSmokeAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_nov",
            password="admin123",
            email="admin_nov@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        student_user = User.objects.create_user(
            username="student_nov",
            password="pw123456",
            first_name="Est",
            last_name="Udio",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.student = Student.objects.create(user=student_user, document_number="DOCNOV")

        self.institution = Institution.objects.create(name="Institución Demo")

        self.novelty_type, _ = NoveltyType.objects.update_or_create(
            code="retiro",
            defaults={"name": "Retiro", "is_active": True},
        )
        self.reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=self.novelty_type,
            name="Voluntario",
        )

    def test_types_list(self):
        res = self.client.get("/api/novelties-workflow/types/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_create_case(self):
        payload = {
            "student": self.student.pk,
            "institution": self.institution.pk,
            "novelty_type": self.novelty_type.pk,
            "novelty_reason": self.reason.pk,
            "payload": {"note": "prueba"},
        }
        res = self.client.post("/api/novelties-workflow/cases/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case = NoveltyCase.objects.get(pk=res.data["id"])
        self.assertEqual(case.created_by_id, self.admin.id)

        # File / radicar
        res2 = self.client.post(f"/api/novelties-workflow/cases/{case.pk}/file/", {"comment": "Radico"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK, res2.data)
        case.refresh_from_db()
        self.assertEqual(case.status, "FILED")
        self.assertTrue(case.radicado)
        self.assertIsNotNone(case.filed_at)
        self.assertEqual(case.transitions.count(), 1)


class NoveltiesDocumentsAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_nov_docs",
            password="admin123",
            email="admin_nov_docs@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.institution = Institution.objects.create(name="Institución Demo")

        student_user = User.objects.create_user(
            username="student_nov_docs",
            password="pw123456",
            first_name="Est",
            last_name="Udio",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.student = Student.objects.create(user=student_user, document_number="DOCNOV2")

        self.novelty_type, _ = NoveltyType.objects.update_or_create(
            code="retiro",
            defaults={"name": "Retiro", "is_active": True},
        )
        self.reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=self.novelty_type,
            name="Voluntario",
        )
        NoveltyRequiredDocumentRule.objects.create(
            novelty_type=self.novelty_type,
            novelty_reason=None,
            doc_type="carta_retiro",
            is_required=True,
            visibility="ALL",
        )

    def test_approve_requires_documents_and_moves_to_pending_docs(self):
        # Create case
        payload = {
            "student": self.student.pk,
            "institution": self.institution.pk,
            "novelty_type": self.novelty_type.pk,
            "novelty_reason": self.reason.pk,
            "payload": {},
        }
        res = self.client.post("/api/novelties-workflow/cases/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case_id = res.data["id"]

        # File and send to review
        self.client.post(f"/api/novelties-workflow/cases/{case_id}/file/", {"comment": "Radico"}, format="json")
        self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "A revisar"},
            format="json",
        )

        # Approve without required doc -> should move to PENDING_DOCS
        res2 = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {"comment": "Aprobar"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK, res2.data)
        self.assertEqual(res2.data.get("case", {}).get("status"), "PENDING_DOCS")
        self.assertIn("carta_retiro", res2.data.get("missing_required_documents", []))

        # Upload required attachment
        pdf = SimpleUploadedFile("carta.pdf", b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", content_type="application/pdf")
        res3 = self.client.post(
            "/api/novelties-workflow/attachments/",
            {"case": case_id, "doc_type": "carta_retiro", "file": pdf, "visibility": "ALL"},
            format="multipart",
        )
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED, res3.data)

        # Back to review and approve
        res4 = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "Docs completos"},
            format="json",
        )
        self.assertEqual(res4.status_code, status.HTTP_200_OK, res4.data)

        res5 = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {"comment": "Aprobación final"},
            format="json",
        )
        self.assertEqual(res5.status_code, status.HTTP_200_OK, res5.data)
        self.assertEqual(res5.data.get("status"), "APPROVED")


class NoveltiesExecutionAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_nov_exec",
            password="admin123",
            email="admin_nov_exec@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.institution = Institution.objects.create(name="Institución Demo")
        self.campus = Campus.objects.create(institution=self.institution, name="Sede 01")

        self.year = AcademicYear.objects.create(year=2030, status=AcademicYear.STATUS_ACTIVE)
        self.level = AcademicLevel.objects.create(name="Primaria", level_type="PRIMARY")
        self.grade = Grade.objects.create(name="1", level=self.level, ordinal=1)
        self.group = Group.objects.create(name="A", grade=self.grade, campus=self.campus, academic_year=self.year, capacity=40)

        student_user = User.objects.create_user(
            username="student_nov_exec",
            password="pw123456",
            first_name="Est",
            last_name="Udio",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.student = Student.objects.create(user=student_user, document_number="DOCNOVEXEC")

        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            campus=self.campus,
            status="ACTIVE",
        )

        self.novelty_type, _ = NoveltyType.objects.update_or_create(
            code="retiro",
            defaults={"name": "Retiro", "is_active": True},
        )
        self.reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=self.novelty_type,
            name="Voluntario",
        )

    def test_execute_retiro_is_idempotent(self):
        # Create case
        payload = {
            "student": self.student.pk,
            "institution": self.institution.pk,
            "novelty_type": self.novelty_type.pk,
            "novelty_reason": self.reason.pk,
            "payload": {},
        }
        res = self.client.post("/api/novelties-workflow/cases/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case_id = res.data["id"]

        # File -> review -> approve
        self.client.post(f"/api/novelties-workflow/cases/{case_id}/file/", {"comment": "Radico"}, format="json")
        self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "A revisar"},
            format="json",
        )
        res_approve = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {"comment": "Aprobar"},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK, res_approve.data)
        self.assertEqual(res_approve.data.get("status"), "APPROVED")

        # Execute
        key = "idemp-retiro-1"
        res_exec = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/execute/",
            {"comment": "Ejecuto retiro", "idempotency_key": key},
            format="json",
        )
        self.assertEqual(res_exec.status_code, status.HTTP_200_OK, res_exec.data)
        self.assertEqual(res_exec.data.get("case", {}).get("status"), "EXECUTED")
        self.assertIsNotNone(res_exec.data.get("execution"))
        exec_id = res_exec.data["execution"]["id"]

        # Side-effects
        self.student.user.refresh_from_db()
        self.enrollment.refresh_from_db()
        self.assertFalse(self.student.user.is_active)
        self.assertEqual(self.enrollment.status, "RETIRED")

        # Idempotency: same key should return same execution
        res_exec_2 = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/execute/",
            {"comment": "Reintento", "idempotency_key": key},
            format="json",
        )
        self.assertEqual(res_exec_2.status_code, status.HTTP_200_OK, res_exec_2.data)
        self.assertEqual(res_exec_2.data.get("execution", {}).get("id"), exec_id)

        case = NoveltyCase.objects.get(pk=case_id)
        self.assertEqual(case.transitions.count(), 4)

    def test_execute_graduacion_marks_enrollment_graduated(self):
        # Graduation should only be allowed for 11th grade students.
        grade_11 = Grade.objects.create(name="11", level=self.level, ordinal=11)
        group_11 = Group.objects.create(
            name="A",
            grade=grade_11,
            campus=self.campus,
            academic_year=self.year,
            capacity=40,
        )
        self.enrollment.grade = grade_11
        self.enrollment.group = group_11
        self.enrollment.save(update_fields=["grade", "group"])

        novelty_type, _ = NoveltyType.objects.update_or_create(
            code="graduacion",
            defaults={"name": "Graduación", "is_active": True},
        )
        reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=novelty_type,
            name="Graduación",
        )

        res = self.client.post(
            "/api/novelties-workflow/cases/",
            {
                "student": self.student.pk,
                "institution": self.institution.pk,
                "novelty_type": novelty_type.pk,
                "novelty_reason": reason.pk,
                "payload": {},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case_id = res.data["id"]

        self.client.post(f"/api/novelties-workflow/cases/{case_id}/file/", {"comment": "Radico"}, format="json")
        self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "A revisar"},
            format="json",
        )
        res_approve = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {"comment": "Aprobar"},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK, res_approve.data)
        self.assertEqual(res_approve.data.get("status"), "APPROVED")

        res_exec = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/execute/",
            {"comment": "Ejecutar graduación"},
            format="json",
        )
        self.assertEqual(res_exec.status_code, status.HTTP_200_OK, res_exec.data)
        self.assertEqual(res_exec.data.get("case", {}).get("status"), "EXECUTED")

        self.student.user.refresh_from_db()
        self.enrollment.refresh_from_db()
        self.assertFalse(self.student.user.is_active)
        self.assertEqual(self.enrollment.status, "GRADUATED")

    def test_graduacion_does_not_require_documents_to_approve_or_execute(self):
        # Graduation should only be allowed for 11th grade students.
        grade_11 = Grade.objects.create(name="11", level=self.level, ordinal=11)
        group_11 = Group.objects.create(
            name="A",
            grade=grade_11,
            campus=self.campus,
            academic_year=self.year,
            capacity=40,
        )
        self.enrollment.grade = grade_11
        self.enrollment.group = group_11
        self.enrollment.save(update_fields=["grade", "group"])

        novelty_type, _ = NoveltyType.objects.update_or_create(
            code="graduacion",
            defaults={"name": "Graduación", "is_active": True},
        )
        reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=novelty_type,
            name="Graduación",
        )

        # Even if a required-document rule exists, graduation should not be blocked.
        NoveltyRequiredDocumentRule.objects.create(
            novelty_type=novelty_type,
            novelty_reason=None,
            doc_type="acta_graduacion",
            is_required=True,
            visibility="ALL",
        )

        res = self.client.post(
            "/api/novelties-workflow/cases/",
            {
                "student": self.student.pk,
                "institution": self.institution.pk,
                "novelty_type": novelty_type.pk,
                "novelty_reason": reason.pk,
                "payload": {},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case_id = res.data["id"]

        self.client.post(f"/api/novelties-workflow/cases/{case_id}/file/", {"comment": "Radico"}, format="json")
        self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "A revisar"},
            format="json",
        )

        # Approve without providing a comment should still approve (auto-comment server-side).
        res_approve = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK, res_approve.data)
        self.assertEqual(res_approve.data.get("status"), "APPROVED")

        # Execute should not be blocked by missing required documents for graduation.
        res_exec = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/execute/",
            {"comment": "Ejecutar graduación"},
            format="json",
        )
        self.assertEqual(res_exec.status_code, status.HTTP_200_OK, res_exec.data)
        self.assertEqual(res_exec.data.get("case", {}).get("status"), "EXECUTED")

        self.student.user.refresh_from_db()
        self.enrollment.refresh_from_db()
        self.assertFalse(self.student.user.is_active)
        self.assertEqual(self.enrollment.status, "GRADUATED")

    def test_graduacion_is_not_available_for_non_11th_grade_students(self):
        novelty_type, _ = NoveltyType.objects.update_or_create(
            code="graduacion",
            defaults={"name": "Graduación", "is_active": True},
        )
        reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=novelty_type,
            name="Graduación",
        )

        # setUp uses grade ordinal=1, so creation should be blocked.
        res = self.client.post(
            "/api/novelties-workflow/cases/",
            {
                "student": self.student.pk,
                "institution": self.institution.pk,
                "novelty_type": novelty_type.pk,
                "novelty_reason": reason.pk,
                "payload": {},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)


class NoveltiesCapacityPolicyAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_nov_cap",
            password="admin123",
            email="admin_nov_cap@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.client.force_authenticate(user=self.admin)

        self.institution = Institution.objects.create(name="Institución Demo")
        self.campus = Campus.objects.create(institution=self.institution, name="Sede 01")

        self.year = AcademicYear.objects.create(year=2031, status=AcademicYear.STATUS_ACTIVE)
        self.level = AcademicLevel.objects.create(name="Primaria", level_type="PRIMARY")
        self.grade = Grade.objects.create(name="2", level=self.level, ordinal=2)

        # Two groups same grade/year/shift
        self.dest_group = Group.objects.create(
            name="A",
            grade=self.grade,
            campus=self.campus,
            academic_year=self.year,
            capacity=40,
            shift="MORNING",
        )
        self.src_group = Group.objects.create(
            name="B",
            grade=self.grade,
            campus=self.campus,
            academic_year=self.year,
            capacity=40,
            shift="MORNING",
        )

        # Bucket capacity = 1, so dest_group should effectively allow only 1 ACTIVE enrollment.
        CapacityBucket.objects.create(
            campus=self.campus,
            grade=self.grade,
            academic_year=self.year,
            shift="MORNING",
            modality="",
            capacity=1,
            is_active=True,
        )

        # Student 1 occupies the only slot in dest group
        u1 = User.objects.create_user(
            username="student_cap_1",
            password="pw123456",
            first_name="A",
            last_name="B",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.s1 = Student.objects.create(user=u1, document_number="DOCCAP1")
        Enrollment.objects.create(
            student=self.s1,
            academic_year=self.year,
            grade=self.grade,
            group=self.dest_group,
            campus=self.campus,
            status="ACTIVE",
        )

        # Student 2 starts in src_group
        u2 = User.objects.create_user(
            username="student_cap_2",
            password="pw123456",
            first_name="C",
            last_name="D",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.s2 = Student.objects.create(user=u2, document_number="DOCCAP2")
        self.e2 = Enrollment.objects.create(
            student=self.s2,
            academic_year=self.year,
            grade=self.grade,
            group=self.src_group,
            campus=self.campus,
            status="ACTIVE",
        )

        self.novelty_type, _ = NoveltyType.objects.update_or_create(
            code="cambio_interno",
            defaults={"name": "Cambio interno", "is_active": True},
        )
        self.reason, _ = NoveltyReason.objects.get_or_create(
            novelty_type=self.novelty_type,
            name="Cambio de grupo",
        )

    def test_cambio_interno_respects_bucket_capacity(self):
        res = self.client.post(
            "/api/novelties-workflow/cases/",
            {
                "student": self.s2.pk,
                "institution": self.institution.pk,
                "novelty_type": self.novelty_type.pk,
                "novelty_reason": self.reason.pk,
                "payload": {"destination_group_id": self.dest_group.pk},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        case_id = res.data["id"]

        self.client.post(f"/api/novelties-workflow/cases/{case_id}/file/", {"comment": "Radico"}, format="json")
        self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/send-to-review/",
            {"comment": "A revisar"},
            format="json",
        )
        res_approve = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/approve/",
            {"comment": "Aprobar"},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK, res_approve.data)
        self.assertEqual(res_approve.data.get("status"), "APPROVED")

        res_exec = self.client.post(
            f"/api/novelties-workflow/cases/{case_id}/execute/",
            {"comment": "Ejecutar cambio"},
            format="json",
        )
        self.assertEqual(res_exec.status_code, status.HTTP_400_BAD_REQUEST, res_exec.data)
        self.e2.refresh_from_db()
        self.assertEqual(self.e2.group_id, self.src_group.id)


class NoveltySlaNotificationsCommandTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_superuser(
            username="nov_sla_superadmin",
            password="admin123",
            email="nov_sla_superadmin@example.com",
            role=getattr(User, "ROLE_SUPERADMIN", "SUPERADMIN"),
        )
        self.admin = User.objects.create_superuser(
            username="nov_sla_admin",
            password="admin123",
            email="nov_sla_admin@example.com",
            role=getattr(User, "ROLE_ADMIN", "ADMIN"),
        )
        self.unrelated_coordinator = User.objects.create_user(
            username="nov_sla_coordinator_unrelated",
            password="admin123",
            email="nov_sla_coordinator_unrelated@example.com",
            role=getattr(User, "ROLE_COORDINATOR", "COORDINATOR"),
        )
        self.coordinator = User.objects.create_user(
            username="nov_sla_coordinator",
            password="admin123",
            email="nov_sla_coordinator@example.com",
            role=getattr(User, "ROLE_COORDINATOR", "COORDINATOR"),
        )
        self.teacher = User.objects.create_user(
            username="nov_sla_teacher",
            password="admin123",
            email="nov_sla_teacher@example.com",
            role=getattr(User, "ROLE_TEACHER", "TEACHER"),
        )

        student_user = User.objects.create_user(
            username="nov_sla_student",
            password="admin123",
            role=getattr(User, "ROLE_STUDENT", "STUDENT"),
        )
        self.student = Student.objects.create(user=student_user, document_number="NOVSLA001")

        self.institution = Institution.objects.create(name="Institución SLA")
        self.institution.rector = self.admin
        self.institution.save(update_fields=["rector"])

        self.campus = Campus.objects.create(
            institution=self.institution,
            name="Sede SLA",
            coordinator=self.coordinator,
        )
        self.academic_year = AcademicYear.objects.create(year=2031, status=AcademicYear.STATUS_ACTIVE)
        self.level = AcademicLevel.objects.create(name="Básica SLA", level_type="BASIC")
        self.grade = Grade.objects.create(name="5", level=self.level, ordinal=5)
        self.group = Group.objects.create(
            name="A",
            grade=self.grade,
            campus=self.campus,
            academic_year=self.academic_year,
            director=self.teacher,
            capacity=40,
        )
        Enrollment.objects.create(
            student=self.student,
            academic_year=self.academic_year,
            grade=self.grade,
            group=self.group,
            campus=self.campus,
            status="ACTIVE",
        )

        self.novelty_type = NoveltyType.objects.create(code="traslado_sla", name="Traslado SLA", is_active=True)
        self.reason = NoveltyReason.objects.create(novelty_type=self.novelty_type, name="Solicitud")

    def _create_case_in_review(self, *, days_old: int):
        case = NoveltyCase.objects.create(
            student=self.student,
            institution=self.institution,
            novelty_type=self.novelty_type,
            novelty_reason=self.reason,
            status=NoveltyCase.Status.IN_REVIEW,
            created_by=self.teacher,
        )
        stale_time = timezone.now() - timedelta(days=days_old)
        NoveltyCase.objects.filter(id=case.id).update(updated_at=stale_time)
        return case

    @patch.dict(
        "os.environ",
        {
            "KAMPUS_NOVELTIES_SLA_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_TEACHER_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_ESCALATE_ADMIN_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_ESCALATE_COORDINATOR_DAYS": "5",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_TEACHERS_ENABLED": "true",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_ADMINS_ENABLED": "true",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_COORDINATORS_ENABLED": "true",
            "KAMPUS_NOTIFICATIONS_EMAIL_ENABLED": "false",
        },
        clear=False,
    )
    def test_notifies_teacher_and_admin_before_coordinator_threshold(self):
        self._create_case_in_review(days_old=4)

        call_command("notify_novelties_sla")

        teacher_types = set(Notification.objects.filter(recipient=self.teacher).values_list("type", flat=True))
        admin_types = set(Notification.objects.filter(recipient=self.admin).values_list("type", flat=True))
        superadmin_types = set(Notification.objects.filter(recipient=self.superadmin).values_list("type", flat=True))
        coordinator_types = set(Notification.objects.filter(recipient=self.coordinator).values_list("type", flat=True))

        self.assertIn("NOVELTY_SLA_TEACHER", teacher_types)
        self.assertIn("NOVELTY_SLA_ADMIN", admin_types)
        self.assertIn("NOVELTY_SLA_ADMIN", superadmin_types)
        self.assertNotIn("NOVELTY_SLA_COORDINATOR", coordinator_types)

    @patch.dict(
        "os.environ",
        {
            "KAMPUS_NOVELTIES_SLA_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_TEACHER_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_ESCALATE_ADMIN_DAYS": "3",
            "KAMPUS_NOVELTIES_SLA_ESCALATE_COORDINATOR_DAYS": "5",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_TEACHERS_ENABLED": "true",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_ADMINS_ENABLED": "true",
            "KAMPUS_NOVELTIES_SLA_NOTIFY_COORDINATORS_ENABLED": "true",
            "KAMPUS_NOTIFICATIONS_EMAIL_ENABLED": "false",
        },
        clear=False,
    )
    def test_notifies_coordinator_after_critical_threshold(self):
        self._create_case_in_review(days_old=6)

        call_command("notify_novelties_sla")

        coordinator_types = set(Notification.objects.filter(recipient=self.coordinator).values_list("type", flat=True))
        unrelated_coordinator_types = set(Notification.objects.filter(recipient=self.unrelated_coordinator).values_list("type", flat=True))
        self.assertIn("NOVELTY_SLA_COORDINATOR", coordinator_types)
        self.assertNotIn("NOVELTY_SLA_COORDINATOR", unrelated_coordinator_types)
