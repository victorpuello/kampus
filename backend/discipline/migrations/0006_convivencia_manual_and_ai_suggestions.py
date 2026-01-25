from __future__ import annotations

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_alter_institution_pdf_rector_signature_image"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("discipline", "0005_disciplinecase_sealed_at_disciplinecase_sealed_by_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ManualConvivencia",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(default="Manual de Convivencia", max_length=200)),
                ("version", models.CharField(blank=True, default="", max_length=50)),
                ("is_active", models.BooleanField(default=False)),
                ("file", models.FileField(upload_to="discipline_manuals/")),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("extracted_text", models.TextField(blank=True, default="")),
                ("extracted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "extraction_status",
                    models.CharField(
                        choices=[("PENDING", "Pendiente"), ("DONE", "Listo"), ("FAILED", "Falló")],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("extraction_error", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "institution",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="convivencia_manuals",
                        to="core.institution",
                        verbose_name="Institución",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="convivencia_manuals_uploaded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-uploaded_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="ManualConvivenciaChunk",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("index", models.PositiveIntegerField()),
                ("text", models.TextField()),
                ("start_char", models.PositiveIntegerField(default=0)),
                ("end_char", models.PositiveIntegerField(default=0)),
                ("label", models.CharField(blank=True, default="", max_length=200)),
                (
                    "manual",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chunks",
                        to="discipline.manualconvivencia",
                    ),
                ),
            ],
            options={
                "ordering": ["manual_id", "index"],
                "unique_together": {("manual", "index")},
            },
        ),
        migrations.CreateModel(
            name="DisciplineCaseDecisionSuggestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Borrador"),
                            ("APPROVED", "Aprobado"),
                            ("APPLIED", "Aplicado"),
                            ("REJECTED", "Rechazado"),
                        ],
                        default="DRAFT",
                        max_length=20,
                    ),
                ),
                ("suggested_decision_text", models.TextField()),
                ("reasoning", models.TextField(blank=True, default="")),
                ("citations", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("applied_at", models.DateTimeField(blank=True, null=True)),
                (
                    "approved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_decision_suggestions_approved",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "applied_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_decision_suggestions_applied",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="decision_suggestions",
                        to="discipline.disciplinecase",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_decision_suggestions_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "manual",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="decision_suggestions",
                        to="discipline.manualconvivencia",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="manualconvivenciachunk",
            index=models.Index(fields=["manual", "index"], name="discipline_m_manual_i_0b8d3a_idx"),
        ),
        migrations.AddIndex(
            model_name="disciplinecasedecisionsuggestion",
            index=models.Index(fields=["case", "created_at"], name="discipline_d_case_id_9fb4f5_idx"),
        ),
        migrations.AddIndex(
            model_name="disciplinecasedecisionsuggestion",
            index=models.Index(fields=["manual", "created_at"], name="discipline_d_manual__f49dbe_idx"),
        ),
        migrations.AddConstraint(
            model_name="manualconvivencia",
            constraint=models.UniqueConstraint(
                fields=("institution",),
                condition=Q(("is_active", True)),
                name="uniq_active_convivencia_manual_per_institution",
            ),
        ),
    ]
