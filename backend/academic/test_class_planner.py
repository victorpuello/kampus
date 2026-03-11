from __future__ import annotations

from datetime import date
from io import BytesIO
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APIRequestFactory, APITestCase

from academic.ai import AIConfigError, AIService
from academic.models import AcademicLoad, AcademicYear, Area, ClassPlan, Grade, Group, Period, PeriodTopic, Subject, TeacherAssignment
from academic.serializers import ClassPlanSerializer
from audit.models import AuditLog
from reports.models import ReportJob
from reports.tasks import _build_class_plan_pdf_filename, _normalize_pdf_text


class ClassPlannerBaseMixin:
    def setUp(self):
        super().setUp()
        User = get_user_model()

        self.teacher = User.objects.create_user(
            username="teacher_planner",
            password="pw123456",
            first_name="Docente",
            last_name="Principal",
            role=User.ROLE_TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            username="teacher_planner_other",
            password="pw123456",
            first_name="Otro",
            last_name="Docente",
            role=User.ROLE_TEACHER,
        )
        self.admin = User.objects.create_user(
            username="admin_planner",
            password="pw123456",
            role=User.ROLE_ADMIN,
        )

        self.year = AcademicYear.objects.create(year=2026, status=AcademicYear.STATUS_ACTIVE)
        self.grade = Grade.objects.create(name="10", ordinal=10)
        self.area = Area.objects.create(name="Ciencias Naturales")
        self.subject = Subject.objects.create(name="Biología", area=self.area)
        self.load = AcademicLoad.objects.create(subject=self.subject, grade=self.grade, hours_per_week=4)
        self.group = Group.objects.create(name="A", grade=self.grade, academic_year=self.year, capacity=35)
        self.other_group = Group.objects.create(name="B", grade=self.grade, academic_year=self.year, capacity=35)
        self.period = Period.objects.create(
            academic_year=self.year,
            name="Primer Periodo",
            start_date=date(2026, 1, 15),
            end_date=date(2026, 3, 30),
        )
        self.assignment = TeacherAssignment.objects.create(
            teacher=self.teacher,
            academic_load=self.load,
            group=self.group,
            academic_year=self.year,
        )
        self.other_assignment = TeacherAssignment.objects.create(
            teacher=self.other_teacher,
            academic_load=self.load,
            group=self.other_group,
            academic_year=self.year,
        )
        self.topic = PeriodTopic.objects.create(
            period=self.period,
            academic_load=self.load,
            title="La célula",
            description="Estructuras y funciones principales.",
            sequence_order=1,
            created_by=self.admin,
        )

    def make_finalized_plan(self, **overrides):
        payload = {
            "teacher_assignment": self.assignment,
            "period": self.period,
            "topic": self.topic,
            "title": "Plan de clase sobre la célula",
            "class_date": date(2026, 2, 10),
            "duration_minutes": 60,
            "learning_result": "Reconoce la estructura básica de la célula y su función.",
            "competency_know": "Identifica organelos principales.",
            "competency_do": "Explica la función de cada organelo en una guía.",
            "competency_be": "Participa con respeto en el trabajo colaborativo.",
            "class_purpose": "Comprender la célula como unidad básica de la vida.",
            "start_time_minutes": 10,
            "development_time_minutes": 40,
            "closing_time_minutes": 10,
            "start_activities": "Activación de conocimientos previos.",
            "development_activities": "Observación guiada y análisis del esquema celular.",
            "closing_activities": "Socialización de hallazgos.",
            "evidence_product": "Mapa conceptual de organelos.",
            "evaluation_instrument": "Rúbrica analítica",
            "evaluation_criterion": "Explica con precisión la función de los organelos y aplica vocabulario científico básico.",
            "resources": "Guía impresa y lámina.",
            "dua_adjustments": "Apoyo visual y lectura guiada.",
            "status": ClassPlan.STATUS_FINALIZED,
            "created_by": self.teacher,
            "updated_by": self.teacher,
        }
        payload.update(overrides)
        return ClassPlan.objects.create(**payload)


class ClassPlanSerializerTest(ClassPlannerBaseMixin, APITestCase):
    def test_rejects_placeholder_siee_criterion_when_finalizing(self):
        factory = APIRequestFactory()
        request = factory.post("/api/class-plans/")
        request.user = self.teacher

        serializer = ClassPlanSerializer(
            data={
                "teacher_assignment": self.assignment.id,
                "period": self.period.id,
                "topic": self.topic.id,
                "title": "Plan corto",
                "duration_minutes": 60,
                "learning_result": "Describe la célula.",
                "competency_know": "Saber básico.",
                "competency_do": "Hacer básico.",
                "competency_be": "Ser básico.",
                "evidence_product": "Guía.",
                "evaluation_instrument": "Lista de chequeo",
                "evaluation_criterion": "N/A",
                "start_time_minutes": 10,
                "development_time_minutes": 40,
                "closing_time_minutes": 10,
                "status": ClassPlan.STATUS_FINALIZED,
            },
            context={"request": request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("evaluation_criterion", serializer.errors)

    def test_rejects_teacher_using_foreign_assignment(self):
        factory = APIRequestFactory()
        request = factory.post("/api/class-plans/")
        request.user = self.teacher

        serializer = ClassPlanSerializer(
            data={
                "teacher_assignment": self.other_assignment.id,
                "period": self.period.id,
                "title": "Plan ajeno",
                "duration_minutes": 60,
                "start_time_minutes": 10,
                "development_time_minutes": 40,
                "closing_time_minutes": 10,
            },
            context={"request": request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("teacher_assignment", serializer.errors)


class ClassPlanImportAndExportAPITest(ClassPlannerBaseMixin, APITestCase):
    def test_import_csv_creates_and_updates_topics(self):
        self.client.force_authenticate(user=self.admin)

        csv_content = "\n".join(
            [
                "academic_year,period_name,grade_name,subject_name,sequence_order,title,description",
                "2026,Primer Periodo,10,Biología,1,La célula,Versión actualizada",
                "2026,Primer Periodo,10,Biología,2,Tejidos,Clasificación general",
                "2026,Primer Periodo,10,Química,3,Átomos,No existe la carga",
            ]
        )
        upload = BytesIO(csv_content.encode("utf-8"))
        upload.name = "tematicas.csv"

        response = self.client.post(
            "/api/period-topics/import-file/",
            {"file": upload},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 1)
        self.assertEqual(len(response.data["errors"]), 1)

        self.topic.refresh_from_db()
        self.assertEqual(self.topic.description, "Versión actualizada")
        self.assertTrue(PeriodTopic.objects.filter(title="Tejidos", period=self.period, academic_load=self.load).exists())

    def test_import_xlsx_creates_and_updates_topics(self):
        self.client.force_authenticate(user=self.admin)

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["academic_year", "period_name", "grade_name", "subject_name", "sequence_order", "title", "description"])
        worksheet.append(["2026", "Primer Periodo", "10", "Biología", "1", "La célula", "Actualizada desde Excel"])
        worksheet.append(["2026", "Primer Periodo", "10", "Biología", "2", "Tejidos", "Clasificación celular"])

        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        output.name = "tematicas.xlsx"

        response = self.client.post(
            "/api/period-topics/import-file/",
            {"file": output},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 1)

        self.topic.refresh_from_db()
        self.assertEqual(self.topic.description, "Actualizada desde Excel")
        self.assertTrue(PeriodTopic.objects.filter(title="Tejidos", period=self.period, academic_load=self.load).exists())

    def test_import_file_accepts_area_name_when_grade_has_single_matching_subject(self):
        self.client.force_authenticate(user=self.admin)

        csv_content = "\n".join(
            [
                "academic_year,period_name,grade_name,subject_name,sequence_order,title,description",
                "2026,Primer Periodo,10,Ciencias Naturales,2,Tejidos,Clasificación general",
            ]
        )
        upload = BytesIO(csv_content.encode("utf-8"))
        upload.name = "tematicas.csv"

        response = self.client.post(
            "/api/period-topics/import-file/",
            {"file": upload},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 0)
        self.assertEqual(response.data["errors"], [])
        self.assertTrue(PeriodTopic.objects.filter(title="Tejidos", period=self.period, academic_load=self.load).exists())

    def test_import_file_matches_subject_without_accents(self):
        self.client.force_authenticate(user=self.admin)

        csv_content = "\n".join(
            [
                "academic_year,period_name,grade_name,subject_name,sequence_order,title,description",
                "2026,Primer Periodo,10,Biologia,2,Tejidos,Clasificación general",
            ]
        )
        upload = BytesIO(csv_content.encode("utf-8"))
        upload.name = "tematicas.csv"

        response = self.client.post(
            "/api/period-topics/import-file/",
            {"file": upload},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 0)
        self.assertEqual(response.data["errors"], [])
        self.assertTrue(PeriodTopic.objects.filter(title="Tejidos", period=self.period, academic_load=self.load).exists())

    def test_validate_import_file_returns_suggestions_for_ambiguous_area(self):
        self.client.force_authenticate(user=self.admin)

        chemistry = Subject.objects.create(name="Química", area=self.area)
        AcademicLoad.objects.create(subject=chemistry, grade=self.grade, hours_per_week=4)

        csv_content = "\n".join(
            [
                "academic_year,period_name,grade_name,subject_name,sequence_order,title,description",
                "2026,Primer Periodo,10,Ciencias Naturales,2,Tejidos,Clasificación general",
            ]
        )
        upload = BytesIO(csv_content.encode("utf-8"))
        upload.name = "tematicas.csv"

        response = self.client.post(
            "/api/period-topics/validate-import-file/",
            {"file": upload},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ready_rows"], 0)
        self.assertEqual(response.data["review_rows"], 1)
        self.assertEqual(response.data["error_rows"], 0)
        self.assertEqual(response.data["rows"][0]["status"], "review")
        self.assertIn("Biología", response.data["rows"][0]["suggestions"])
        self.assertIn("Química", response.data["rows"][0]["suggestions"])

    def test_import_file_applies_subject_correction_from_validation(self):
        self.client.force_authenticate(user=self.admin)

        chemistry = Subject.objects.create(name="Química", area=self.area)
        AcademicLoad.objects.create(subject=chemistry, grade=self.grade, hours_per_week=4)

        csv_content = "\n".join(
            [
                "academic_year,period_name,grade_name,subject_name,sequence_order,title,description",
                "2026,Primer Periodo,10,Ciencias Naturales,2,Tejidos,Clasificación general",
            ]
        )
        upload = BytesIO(csv_content.encode("utf-8"))
        upload.name = "tematicas.csv"

        response = self.client.post(
            "/api/period-topics/import-file/",
            {"file": upload, "corrections": '[{"row_number": 2, "subject_name": "Biología"}]'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 0)
        self.assertEqual(response.data["errors"], [])
        self.assertTrue(PeriodTopic.objects.filter(title="Tejidos", period=self.period, academic_load=self.load).exists())

    def test_export_pdf_creates_async_job_for_finalized_plan(self):
        plan = self.make_finalized_plan()
        self.client.force_authenticate(user=self.teacher)

        with patch("academic.views.generate_report_job_pdf.delay", return_value=None):
            response = self.client.post(f"/api/class-plans/{plan.id}/export-pdf/")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        job = ReportJob.objects.get(id=response.data["id"])
        self.assertEqual(job.report_type, ReportJob.ReportType.CLASS_PLAN)
        self.assertEqual(job.params["class_plan_id"], plan.id)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=self.teacher,
                event_type="class_plan.export_requested",
                object_type="class_plan",
                object_id=str(plan.id),
            ).exists()
        )


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class ClassPlanReportJobAPITest(ClassPlannerBaseMixin, APITestCase):
    def test_teacher_can_create_async_report_job_for_own_finalized_plan(self):
        plan = self.make_finalized_plan()
        self.client.force_authenticate(user=self.teacher)

        with patch("reports.views.generate_report_job_pdf.delay", return_value=None):
            response = self.client.post(
                "/api/reports/jobs/",
                {"report_type": ReportJob.ReportType.CLASS_PLAN, "params": {"class_plan_id": plan.id}},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        job = ReportJob.objects.get(id=response.data["id"])
        self.assertEqual(job.report_type, ReportJob.ReportType.CLASS_PLAN)
        self.assertEqual(job.params["class_plan_id"], plan.id)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=self.teacher,
                event_type="class_plan.export_requested",
                object_type="class_plan",
                object_id=str(plan.id),
            ).exists()
        )

    def test_teacher_cannot_create_async_report_job_for_other_teacher_plan(self):
        plan = self.make_finalized_plan(teacher_assignment=self.other_assignment)
        self.client.force_authenticate(user=self.teacher)

        response = self.client.post(
            "/api/reports/jobs/",
            {"report_type": ReportJob.ReportType.CLASS_PLAN, "params": {"class_plan_id": plan.id}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)


class ClassPlanAIFallbackTest(ClassPlannerBaseMixin, APITestCase):
    def test_generate_draft_returns_fallback_when_ai_is_unavailable(self):
        self.client.force_authenticate(user=self.teacher)

        with patch.object(AIService, "_ensure_available", side_effect=AIConfigError("Gemini no disponible")):
            response = self.client.post(
                "/api/class-plans/generate-draft/",
                {
                    "teacher_assignment": self.assignment.id,
                    "topic": self.topic.id,
                    "duration_minutes": 60,
                    "title": "Plan asistido",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], self.topic.title)
        self.assertEqual(response.data["duration_minutes"], 60)
        self.assertEqual(
            response.data["duration_minutes"],
            response.data["start_time_minutes"] + response.data["development_time_minutes"] + response.data["closing_time_minutes"],
        )
        self.assertTrue(response.data["evaluation_instrument"])

    def test_generate_section_returns_fallback_when_ai_is_unavailable(self):
        self.client.force_authenticate(user=self.teacher)

        with patch.object(AIService, "_ensure_available", side_effect=AIConfigError("Gemini no disponible")):
            response = self.client.post(
                "/api/class-plans/generate-section/",
                {
                    "section": "evaluation",
                    "topic_title": self.topic.title,
                    "topic_description": self.topic.description,
                    "subject_name": self.subject.name,
                    "grade_name": self.grade.name,
                    "group_name": self.group.name,
                    "period_name": self.period.name,
                    "duration_minutes": 60,
                    "title": "Plan asistido",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("evidence_product", response.data)
        self.assertIn("evaluation_instrument", response.data)
        self.assertIn("evaluation_criterion", response.data)

    def test_generate_draft_normalizes_leaked_english_terms_from_ai_response(self):
        self.client.force_authenticate(user=self.teacher)

        ai_payload = {
            "title": "Plan asistido",
            "duration_minutes": 55,
            "learning_result": "Comprende la methodology de trabajo y su aplicación.",
            "dba_reference": "DBA en español.",
            "standard_reference": "Estándar en español.",
            "competency_know": "Reconoce conceptos clave.",
            "competency_do": "Desarrolla una activity contextualizada.",
            "competency_be": "Participa con respeto.",
            "class_purpose": "Aplicar la methodology en clase.",
            "start_time_minutes": 10,
            "start_activities": "Opening activity con preguntas orientadoras.",
            "development_time_minutes": 35,
            "development_activities": "Main activities con trabajo colaborativo.",
            "closing_time_minutes": 10,
            "closing_activities": "Closing activity y reflexión final.",
            "evidence_product": "Evidence escrita del proceso.",
            "evaluation_instrument": "Rúbrica y checklist",
            "evaluation_criterion": "Básico - Completa la activity propuesta - Rango 3.0-3.9 (durante la clase)",
            "resources": "Digital resources y guía impresa.",
            "dua_adjustments": "Ajustes y visual resources según necesidad.",
        }

        class _FakeResponse:
            text = json.dumps(ai_payload, ensure_ascii=False)

        with patch.object(AIService, "_ensure_available", return_value=None), patch.object(
            AIService,
            "__init__",
            lambda self: setattr(self, "model", type("Model", (), {"generate_content": lambda *_args, **_kwargs: _FakeResponse()})()),
        ):
            response = self.client.post(
                "/api/class-plans/generate-draft/",
                {
                    "teacher_assignment": self.assignment.id,
                    "topic": self.topic.id,
                    "duration_minutes": 55,
                    "title": "Plan asistido",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("methodology", json.dumps(response.data, ensure_ascii=False).lower())
        self.assertNotIn("activity", json.dumps(response.data, ensure_ascii=False).lower())
        self.assertIn("metodología", response.data["learning_result"].lower())
        self.assertIn("actividad", response.data["competency_do"].lower())
        self.assertIn("evidencia", response.data["evidence_product"].lower())


class ClassPlanSummaryAPITest(ClassPlannerBaseMixin, APITestCase):
    def test_my_summary_returns_metrics_and_recent_activity(self):
        first_plan = self.make_finalized_plan()
        second_plan = ClassPlan.objects.create(
            teacher_assignment=self.assignment,
            period=self.period,
            topic=self.topic,
            title="Plan en borrador",
            duration_minutes=60,
            start_time_minutes=10,
            development_time_minutes=40,
            closing_time_minutes=10,
            ai_assisted_sections=["learning", "evaluation"],
            created_by=self.teacher,
            updated_by=self.teacher,
        )
        AuditLog.objects.create(
            actor=self.teacher,
            event_type="class_plan.finalized",
            object_type="class_plan",
            object_id=str(first_plan.id),
            metadata={"title": first_plan.title, "period_id": self.period.id, "academic_year_id": self.year.id},
        )
        AuditLog.objects.create(
            actor=self.teacher,
            event_type="class_plan.updated",
            object_type="class_plan",
            object_id=str(second_plan.id),
            metadata={"title": second_plan.title, "period_id": self.period.id, "academic_year_id": self.year.id},
        )
        ReportJob.objects.create(
            created_by=self.teacher,
            report_type=ReportJob.ReportType.CLASS_PLAN,
            params={"class_plan_id": first_plan.id},
            status=ReportJob.Status.SUCCEEDED,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            "/api/class-plans/my-summary/",
            {"academic_year": self.year.id, "period": self.period.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["total_plans"], 2)
        self.assertEqual(response.data["summary"]["draft_plans"], 1)
        self.assertEqual(response.data["summary"]["finalized_plans"], 1)
        self.assertEqual(response.data["summary"]["ai_assisted_plans"], 1)
        self.assertEqual(response.data["summary"]["export_completed"], 1)
        self.assertGreaterEqual(len(response.data["recent_activity"]), 2)

class ClassPlanPdfFormattingTest(APITestCase):
    def test_build_class_plan_pdf_filename_uses_three_topic_words_and_date(self):
        topic = type("Topic", (), {"title": "La célula y sus organelos principales"})()
        plan = type(
            "Plan",
            (),
            {
                "topic": topic,
                "title": "Plan alterno",
                "class_date": date(2026, 2, 10),
                "created_at": None,
            },
        )()

        filename = _build_class_plan_pdf_filename(plan)

        self.assertEqual(filename, "Plan_de_Clase_Celula_Organelos_Principales_2026-02-10.pdf")

    def test_normalize_pdf_text_removes_markdown_and_list_literals(self):
        raw = "['**Respeto por el entorno**', '* Trabajo colaborativo', '3. Cierre reflexivo']"

        cleaned = _normalize_pdf_text(raw)

        self.assertNotIn("['", cleaned)
        self.assertNotIn("**", cleaned)
        self.assertIn("Respeto por el entorno", cleaned)
        self.assertIn("- Trabajo colaborativo", cleaned)
        self.assertIn("- Cierre reflexivo", cleaned)
    
    def test_text_to_pdf_html_renders_bullets_and_subtitles(self):
        from reports.tasks import _text_to_pdf_html

        html = _text_to_pdf_html(
            "Materiales:\n- Guia del estudiante\n- Cuaderno\nMomento de cierre:\nSocializacion final"
        )

        self.assertIn('<p class="rich-subtitle">Materiales:</p>', html)
        self.assertIn("<ul>", html)
        self.assertIn("<li>Guia del estudiante</li>", html)
        self.assertIn("<li>Cuaderno</li>", html)
        self.assertIn('<p class="rich-subtitle">Momento de cierre:</p>', html)
        self.assertIn("<p>Socializacion final</p>", html)