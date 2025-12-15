from datetime import date

from django.test import TestCase

from academic.models import (
	AcademicLevel,
	AcademicLoad,
	AcademicYear,
	AchievementDefinition,
	Area,
	Dimension,
	EvaluationComponent,
	EvaluationScale,
	Grade,
	Group,
	Period,
	Subject,
)
from core.models import Campus, Institution
from core.utils.config_transfer import export_config, import_config

from rest_framework.test import APIClient
from users.models import User


class ConfigTransferTests(TestCase):
	def test_export_import_round_trip(self):
		inst = Institution.objects.create(name="Institución Demo")
		campus = Campus.objects.create(
			institution=inst,
			name="Sede Principal",
			levels=["BASICA_PRIMARIA"],
			shifts=["MANANA"],
		)
		year = AcademicYear.objects.create(year=2025)
		period = Period.objects.create(
			academic_year=year,
			name="Periodo 1",
			start_date=date(2025, 1, 1),
			end_date=date(2025, 3, 31),
		)
		level = AcademicLevel.objects.create(name="Primaria", level_type="PRIMARY")
		grade = Grade.objects.create(name="Cuarto", level=level)
		group = Group.objects.create(name="A", grade=grade, campus=campus, academic_year=year)
		area = Area.objects.create(name="Ciencias")
		subject = Subject.objects.create(name="Ciencias Naturales", area=area)
		load = AcademicLoad.objects.create(subject=subject, grade=grade, hours_per_week=3)
		EvaluationScale.objects.create(academic_year=year, name="Superior", scale_type="NUMERIC")
		dim = Dimension.objects.create(academic_year=year, name="Cognitivo", percentage=100)
		EvaluationComponent.objects.create(academic_load=load, name="Saber", weight_percentage=100)
		definition = AchievementDefinition.objects.create(
			description="Reconoce los seres vivos",
			area=area,
			grade=grade,
			subject=subject,
			academic_load=load,
			dimension=dim,
		)
		self.assertTrue(definition.code)

		payload = export_config(include_media=False)
		self.assertEqual(payload["schema_version"], 1)

		# Overwrite to simulate importing into a clean instance.
		import_config(payload, overwrite=True, dry_run=False)

		self.assertEqual(Institution.objects.count(), 1)
		self.assertEqual(Campus.objects.count(), 1)
		self.assertEqual(AcademicYear.objects.count(), 1)
		self.assertEqual(Period.objects.count(), 1)
		self.assertEqual(AcademicLevel.objects.count(), 1)
		self.assertEqual(Grade.objects.count(), 1)
		self.assertEqual(Group.objects.count(), 1)
		self.assertEqual(Area.objects.count(), 1)
		self.assertEqual(Subject.objects.count(), 1)
		self.assertEqual(AcademicLoad.objects.count(), 1)
		self.assertEqual(EvaluationScale.objects.count(), 1)
		self.assertEqual(Dimension.objects.count(), 1)
		self.assertEqual(EvaluationComponent.objects.count(), 1)
		self.assertEqual(AchievementDefinition.objects.count(), 1)


class ConfigTransferApiTests(TestCase):
	def setUp(self):
		self.client = APIClient()
		self.admin = User.objects.create_user(
			username="admin_cfg",
			email="admin_cfg@example.com",
			password="password",
			role=User.ROLE_ADMIN,
		)
		self.teacher = User.objects.create_user(
			username="teacher_cfg",
			email="teacher_cfg@example.com",
			password="password",
			role=User.ROLE_TEACHER,
		)

	def get_token(self, user):
		resp = self.client.post("/api/token/", {"username": user.username, "password": "password"})
		return resp.data["access"]

	def test_teacher_cannot_export(self):
		token = self.get_token(self.teacher)
		self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
		resp = self.client.get("/api/config/export/")
		self.assertEqual(resp.status_code, 403)

	def test_admin_can_export_and_import_dry_run(self):
		token = self.get_token(self.admin)
		self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)

		# Export
		resp = self.client.get("/api/config/export/")
		self.assertEqual(resp.status_code, 200)
		self.assertIn("application/json", resp["Content-Type"])

		# Import (dry-run) via raw JSON body
		payload = export_config(include_media=False)
		resp2 = self.client.post("/api/config/import/", payload, format="json")
		self.assertEqual(resp2.status_code, 200)
		self.assertIn("created", resp2.data)

	def test_overwrite_requires_confirmation(self):
		token = self.get_token(self.admin)
		self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
		payload = export_config(include_media=False)
		payload["overwrite"] = True
		resp = self.client.post(
			"/api/config/import/",
			{"overwrite": True, "dry_run": True, "schema_version": payload["schema_version"]},
			format="json",
		)
		self.assertEqual(resp.status_code, 400)
