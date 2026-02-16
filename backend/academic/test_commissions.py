from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academic.commission_services import CommissionDifficultyResult, compute_difficulties_for_commission
from academic.models import (
    AcademicLoad,
    AcademicYear,
    Achievement,
    AchievementGrade,
    Area,
    Commission,
    CommissionStudentDecision,
    Grade,
    GradeSheet,
    Group,
    Period,
    Subject,
    TeacherAssignment,
)
from notifications.models import Notification
from reports.models import ReportJob
from students.models import Enrollment, ObserverAnnotation, Student


class CommissionWorkflowApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.admin = User.objects.create_user(
            username="admin_commission",
            password="pass",
            role=User.ROLE_ADMIN,
            first_name="Admin",
            last_name="Comisiones",
        )
        self.teacher = User.objects.create_user(
            username="teacher_commission",
            password="pass",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Director",
        )
        self.student_user = User.objects.create_user(
            username="student_commission",
            password="pass",
            role=User.ROLE_STUDENT,
            first_name="Estudiante",
            last_name="Prueba",
        )

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="P1",
            start_date="2026-01-01",
            end_date="2026-03-31",
            is_closed=True,
        )
        self.grade = Grade.objects.create(name="Séptimo", ordinal=7)
        self.group = Group.objects.create(
            name="A",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher,
        )

        self.student = Student.objects.create(user=self.student_user, document_number="DOC-COM-1")
        self.enrollment = Enrollment.objects.create(
            student=self.student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )

        self.commission = Commission.objects.create(
            commission_type=Commission.TYPE_EVALUATION,
            academic_year=self.year,
            period=self.period,
            group=self.group,
            created_by=self.admin,
        )

    def _extract_reason_codes(self, response):
        preconditions = response.data.get("preconditions", {})
        items = preconditions.get("blocking_items", [])
        return {item.get("reason_code") for item in items}

    def _create_assignment(self, *, group, suffix):
        area = Area.objects.create(name=f"Área {suffix}")
        subject = Subject.objects.create(name=f"Asignatura {suffix}", area=area)
        academic_load = AcademicLoad.objects.create(subject=subject, grade=group.grade)
        assignment = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=academic_load,
            group=group,
            academic_year=self.year,
        )
        return assignment

    def test_create_commission_blocks_when_period_is_open(self):
        self.client.force_authenticate(user=self.admin)
        open_period = Period.objects.create(
            academic_year=self.year,
            name="P2",
            start_date="2026-04-01",
            end_date="2026-06-30",
            is_closed=False,
        )

        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": open_period.id,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("PERIOD_NOT_CLOSED", self._extract_reason_codes(response))

    def test_create_commission_blocks_when_teacher_assignment_is_missing(self):
        self.client.force_authenticate(user=self.admin)
        area = Area.objects.create(name="Área sin docente")
        subject = Subject.objects.create(name="Asignatura sin docente", area=area)
        AcademicLoad.objects.create(subject=subject, grade=self.group.grade)

        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": self.period.id,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("MISSING_TEACHER_ASSIGNMENT", self._extract_reason_codes(response))

    def test_create_commission_blocks_when_achievements_are_missing(self):
        self.client.force_authenticate(user=self.admin)
        self._create_assignment(group=self.group, suffix="sin-logros")

        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": self.period.id,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("MISSING_ACHIEVEMENTS", self._extract_reason_codes(response))

    def test_create_commission_blocks_when_gradebook_is_incomplete(self):
        self.client.force_authenticate(user=self.admin)
        assignment = self._create_assignment(group=self.group, suffix="planilla-incompleta")
        achievement = Achievement.objects.create(
            academic_load=assignment.academic_load,
            subject=assignment.academic_load.subject,
            group=self.group,
            period=self.period,
            description="Logro de prueba",
            percentage=100,
        )
        GradeSheet.objects.create(teacher_assignment=assignment, period=self.period)

        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": self.period.id,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("INCOMPLETE_GRADEBOOK", self._extract_reason_codes(response))

        preconditions = response.data["preconditions"]
        matching_items = [
            item for item in preconditions["blocking_items"] if item.get("reason_code") == "INCOMPLETE_GRADEBOOK"
        ]
        self.assertEqual(len(matching_items), 1)
        self.assertEqual(int(matching_items[0].get("meta", {}).get("filled", 0)), 0)
        self.assertEqual(int(matching_items[0].get("meta", {}).get("total", 0)), 1)

        gradesheet = GradeSheet.objects.get(teacher_assignment=assignment, period=self.period)
        AchievementGrade.objects.create(
            gradesheet=gradesheet,
            enrollment=self.enrollment,
            achievement=achievement,
            score="4.0",
        )

        ok_response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(ok_response.status_code, 201)

    def test_create_promotion_commission_blocks_when_any_period_is_open(self):
        self.client.force_authenticate(user=self.admin)
        Period.objects.create(
            academic_year=self.year,
            name="P2",
            start_date="2026-04-01",
            end_date="2026-06-30",
            is_closed=False,
        )

        payload = {
            "commission_type": "PROMOTION",
            "academic_year": self.year.id,
            "period": None,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("OPEN_PERIODS_FOR_PROMOTION", self._extract_reason_codes(response))

    def test_teacher_cannot_create_commission(self):
        self.client.force_authenticate(user=self.teacher)
        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": self.period.id,
            "group": self.group.id,
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 403)

    def test_teacher_cannot_execute_commission_actions(self):
        self.client.force_authenticate(user=self.teacher)

        refresh_response = self.client.post(
            f"/api/commissions/{self.commission.id}/refresh-difficulties/",
            {},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 403)

        start_response = self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        self.assertEqual(start_response.status_code, 403)

        close_response = self.client.post(f"/api/commissions/{self.commission.id}/close/", {}, format="json")
        self.assertEqual(close_response.status_code, 403)

        bulk_response = self.client.post(
            f"/api/commissions/{self.commission.id}/generate-actas-async/",
            {"only_flagged": True},
            format="json",
        )
        self.assertEqual(bulk_response.status_code, 403)

        delete_response = self.client.delete(f"/api/commissions/{self.commission.id}/")
        self.assertEqual(delete_response.status_code, 403)

    def test_admin_can_delete_commission(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"/api/commissions/{self.commission.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Commission.objects.filter(id=self.commission.id).exists())

    def test_delete_closed_commission_removes_observer_annotations(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")

        decision = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        generate_response = self.client.post(
            f"/api/commission-decisions/{decision.id}/generate-acta/",
            {},
            format="json",
        )
        self.assertEqual(generate_response.status_code, 200)
        self.assertEqual(ObserverAnnotation.objects.filter(student=self.student).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.teacher, type="COMMISSION_ACTA").count(), 1)

        close_response = self.client.post(f"/api/commissions/{self.commission.id}/close/", {}, format="json")
        self.assertEqual(close_response.status_code, 200)

        delete_response = self.client.delete(f"/api/commissions/{self.commission.id}/")
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Commission.objects.filter(id=self.commission.id).exists())
        self.assertEqual(ObserverAnnotation.objects.filter(student=self.student).count(), 0)
        self.assertEqual(Notification.objects.filter(recipient=self.teacher, type="COMMISSION_ACTA").count(), 0)

    def test_create_commission_auto_generates_normalized_title(self):
        self.client.force_authenticate(user=self.admin)
        group_b = Group.objects.create(
            name="B",
            grade=self.grade,
            academic_year=self.year,
            director=self.teacher,
        )
        payload = {
            "commission_type": "EVALUATION",
            "academic_year": self.year.id,
            "period": self.period.id,
            "group": group_b.id,
            "title": "titulo manual que no debe persistir",
        }

        response = self.client.post("/api/commissions/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "Comisión_P1_SEPTIMO_B_2026")

    def test_list_commissions_does_not_fail_with_missing_created_by(self):
        self.client.force_authenticate(user=self.admin)

        orphan_user = get_user_model().objects.create_user(
            username="orphan_creator",
            password="pass",
            role=get_user_model().ROLE_ADMIN,
        )
        orphan_commission = Commission.objects.create(
            commission_type=Commission.TYPE_EVALUATION,
            academic_year=self.year,
            period=self.period,
            group=self.group,
            created_by=orphan_user,
        )

        orphan_user.delete()

        response = self.client.get("/api/commissions/")
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.data]
        self.assertIn(orphan_commission.id, ids)

    @patch("academic.commission_views.compute_difficulties_for_commission")
    def test_refresh_difficulties_creates_and_updates_decisions(self, mock_compute):
        self.client.force_authenticate(user=self.admin)
        mock_compute.return_value = [
            CommissionDifficultyResult(
                enrollment_id=self.enrollment.id,
                failed_subjects_count=3,
                failed_areas_count=2,
                is_flagged=True,
            )
        ]

        response = self.client.post(f"/api/commissions/{self.commission.id}/refresh-difficulties/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["created"], 1)

        decision = CommissionStudentDecision.objects.get(commission=self.commission, enrollment=self.enrollment)
        self.assertTrue(decision.is_flagged)
        self.assertEqual(decision.failed_subjects_count, 3)
        self.assertEqual(decision.failed_areas_count, 2)

        mock_compute.return_value = [
            CommissionDifficultyResult(
                enrollment_id=self.enrollment.id,
                failed_subjects_count=1,
                failed_areas_count=0,
                is_flagged=False,
            )
        ]

        response2 = self.client.post(f"/api/commissions/{self.commission.id}/refresh-difficulties/", {}, format="json")
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["updated"], 1)

        decision.refresh_from_db()
        self.assertFalse(decision.is_flagged)
        self.assertEqual(decision.failed_subjects_count, 1)
        self.assertEqual(decision.failed_areas_count, 0)

    @patch("academic.commission_views.compute_difficulties_for_commission")
    def test_preview_difficulties_returns_summary(self, mock_compute):
        self.client.force_authenticate(user=self.admin)
        mock_compute.return_value = [
            CommissionDifficultyResult(
                enrollment_id=self.enrollment.id,
                failed_subjects_count=2,
                failed_areas_count=1,
                is_flagged=True,
            )
        ]

        response = self.client.get(f"/api/commissions/{self.commission.id}/preview-difficulties/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["summary"]["total_students"], 1)
        self.assertEqual(response.data["summary"]["total_flagged"], 1)
        self.assertEqual(response.data["summary"]["total_not_flagged"], 0)
        self.assertEqual(response.data["summary"]["flagged_rate"], 100.0)
        self.assertEqual(response.data["summary"]["subjects_distribution"], {2: 1})
        self.assertEqual(response.data["summary"]["areas_distribution"], {1: 1})

    def test_start_commission_changes_status_to_in_progress(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.commission.refresh_from_db()
        self.assertEqual(self.commission.status, Commission.STATUS_IN_PROGRESS)

    def test_list_commission_decisions_is_paginated_with_summary(self):
        self.client.force_authenticate(user=self.admin)
        CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        student_user_2 = get_user_model().objects.create_user(
            username="student_commission_list_2",
            password="pass",
            role=get_user_model().ROLE_STUDENT,
            first_name="Segundo",
            last_name="Listado",
        )
        student_2 = Student.objects.create(user=student_user_2, document_number="DOC-COM-LIST-2")
        enrollment_2 = Enrollment.objects.create(
            student=student_2,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )
        CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=enrollment_2,
            failed_subjects_count=0,
            failed_areas_count=0,
            is_flagged=False,
        )

        response = self.client.get(
            f"/api/commission-decisions/?commission={self.commission.id}&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["summary"]["total_students"], 2)
        self.assertEqual(response.data["summary"]["total_flagged"], 1)
        self.assertEqual(response.data["summary"]["total_not_flagged"], 1)

    def test_close_commission_requires_in_progress(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/commissions/{self.commission.id}/close/", {}, format="json")
        self.assertEqual(response.status_code, 400)

        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        response2 = self.client.post(f"/api/commissions/{self.commission.id}/close/", {}, format="json")
        self.assertEqual(response2.status_code, 200)

    def test_generate_acta_creates_observer_entry_and_is_idempotent(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        decision = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        payload = {
            "title": "Acta compromiso prueba",
            "commitments": "Asistir a refuerzo y entregar actividades pendientes.",
        }
        response = self.client.post(f"/api/commission-decisions/{decision.id}/generate-acta/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ObserverAnnotation.objects.count(), 1)

        decision.refresh_from_db()
        self.assertEqual(decision.decision, CommissionStudentDecision.DECISION_COMMITMENT)
        self.assertIsNotNone(decision.commitment_acta)
        self.assertEqual(decision.commitment_acta.commitments, payload["commitments"])

        annotation = ObserverAnnotation.objects.get(student=self.student)
        self.assertEqual(annotation.rule_key, f"COMMISSION_ACTA:{self.commission.id}:{decision.id}")

        self.assertEqual(Notification.objects.filter(recipient=self.teacher, type="COMMISSION_ACTA").count(), 1)

        response2 = self.client.post(f"/api/commission-decisions/{decision.id}/generate-acta/", payload, format="json")
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(ObserverAnnotation.objects.count(), 1)

    @patch("academic.commission_views.AIService.generate_commitments_blocks")
    def test_generate_acta_stores_human_readable_commitments_in_observer(self, mock_generate_blocks):
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        decision = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        mock_generate_blocks.return_value = {
            "student_commitments": ["Asistir a refuerzos académicos."],
            "guardian_commitments": ["Acompañar tareas en casa."],
            "institution_commitments": ["Brindar nivelación semanal."],
        }

        response = self.client.post(f"/api/commission-decisions/{decision.id}/generate-acta/", {}, format="json")
        self.assertEqual(response.status_code, 200)

        annotation = ObserverAnnotation.objects.get(student=self.student)
        self.assertIn("Compromisos del estudiante", annotation.commitments)
        self.assertIn("Compromisos del acudiente", annotation.commitments)
        self.assertIn("Compromisos de la institución", annotation.commitments)
        self.assertFalse(annotation.commitments.strip().startswith("{"))

        decision.refresh_from_db()
        self.assertTrue((decision.commitment_acta.commitments or "").strip().startswith("{"))

    @patch("reports.weasyprint_utils.render_pdf_bytes_from_html")
    def test_acta_pdf_unexpected_error_returns_503(self, mock_render_pdf):
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        decision = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )
        self.client.post(f"/api/commission-decisions/{decision.id}/generate-acta/", {}, format="json")

        mock_render_pdf.side_effect = RuntimeError("unexpected renderer failure")
        response = self.client.get(f"/api/commission-decisions/{decision.id}/acta/?format=pdf")

        self.assertEqual(response.status_code, 503)
        self.assertIn("No fue posible generar el PDF", str(response.data.get("detail", "")))

    @patch("academic.commission_views.generate_report_job_pdf.delay")
    def test_generate_actas_async_queues_jobs_only_for_flagged(self, mock_delay):
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/commissions/{self.commission.id}/start/", {}, format="json")
        decision_flagged = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        student_user_2 = get_user_model().objects.create_user(
            username="student_commission_2",
            password="pass",
            role=get_user_model().ROLE_STUDENT,
            first_name="Segundo",
            last_name="Estudiante",
        )
        student_2 = Student.objects.create(user=student_user_2, document_number="DOC-COM-2")
        enrollment_2 = Enrollment.objects.create(
            student=student_2,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="ACTIVE",
        )
        CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=enrollment_2,
            failed_subjects_count=0,
            failed_areas_count=0,
            is_flagged=False,
        )

        response = self.client.post(
            f"/api/commissions/{self.commission.id}/generate-actas-async/",
            {"only_flagged": True},
            format="json",
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["count"], 1)

        job = ReportJob.objects.get(report_type=ReportJob.ReportType.ACADEMIC_COMMISSION_ACTA)
        self.assertEqual(job.params.get("decision_id"), decision_flagged.id)
        mock_delay.assert_called_once_with(job.id)

    @patch("academic.commission_views.generate_report_job_pdf.delay")
    def test_generate_actas_async_requires_in_progress(self, mock_delay):
        self.client.force_authenticate(user=self.admin)
        CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        response = self.client.post(
            f"/api/commissions/{self.commission.id}/generate-actas-async/",
            {"only_flagged": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        mock_delay.assert_not_called()

    def test_generate_acta_requires_in_progress(self):
        self.client.force_authenticate(user=self.admin)
        decision = CommissionStudentDecision.objects.create(
            commission=self.commission,
            enrollment=self.enrollment,
            failed_subjects_count=2,
            failed_areas_count=1,
            is_flagged=True,
        )

        response = self.client.post(f"/api/commission-decisions/{decision.id}/generate-acta/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_compute_difficulties_evaluation_without_assignments_returns_not_flagged_students(self):
        results = compute_difficulties_for_commission(self.commission)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].enrollment_id, self.enrollment.id)
        self.assertEqual(results[0].failed_subjects_count, 0)
        self.assertEqual(results[0].failed_areas_count, 0)
        self.assertFalse(results[0].is_flagged)

    def test_compute_difficulties_evaluation_without_period_returns_empty(self):
        commission_without_period = Commission.objects.create(
            commission_type=Commission.TYPE_EVALUATION,
            academic_year=self.year,
            period=None,
            group=self.group,
            created_by=self.admin,
        )

        results = compute_difficulties_for_commission(commission_without_period)
        self.assertEqual(results, [])

    @patch("academic.commission_services.compute_promotions_for_year")
    def test_compute_difficulties_promotion_excludes_retired_enrollments(self, mock_promotion_compute):
        retired_student_user = get_user_model().objects.create_user(
            username="student_commission_retired",
            password="pass",
            role=get_user_model().ROLE_STUDENT,
            first_name="Retirado",
            last_name="Prueba",
        )
        retired_student = Student.objects.create(user=retired_student_user, document_number="DOC-COM-RET")
        retired_enrollment = Enrollment.objects.create(
            student=retired_student,
            academic_year=self.year,
            grade=self.grade,
            group=self.group,
            status="RETIRED",
        )

        promotion_commission = Commission.objects.create(
            commission_type=Commission.TYPE_PROMOTION,
            academic_year=self.year,
            period=None,
            group=self.group,
            created_by=self.admin,
        )

        mock_promotion_compute.return_value = {
            int(self.enrollment.id): SimpleNamespace(failed_subject_ids=[1, 2], failed_area_ids=[10]),
            int(retired_enrollment.id): SimpleNamespace(failed_subject_ids=[3, 4, 5], failed_area_ids=[20, 21]),
        }

        results = compute_difficulties_for_commission(promotion_commission)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].enrollment_id, self.enrollment.id)
        self.assertEqual(results[0].failed_subjects_count, 2)
        self.assertEqual(results[0].failed_areas_count, 1)
        self.assertTrue(results[0].is_flagged)
