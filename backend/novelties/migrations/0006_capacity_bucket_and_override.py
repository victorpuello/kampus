from __future__ import annotations

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0005_noveltyexecution_and_case_idempotency"),
        ("core", "0001_initial"),
        ("academic", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CapacityBucket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("shift", models.CharField(default="MORNING", max_length=20)),
                ("modality", models.SlugField(blank=True, default="", max_length=40)),
                ("capacity", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "academic_year",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="capacity_buckets",
                        to="academic.academicyear",
                    ),
                ),
                (
                    "campus",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="capacity_buckets",
                        to="core.campus",
                    ),
                ),
                (
                    "grade",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="capacity_buckets",
                        to="academic.grade",
                    ),
                ),
            ],
            options={
                "unique_together": {("campus", "grade", "academic_year", "shift", "modality")},
            },
        ),
        migrations.CreateModel(
            name="GroupCapacityOverride",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("capacity", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "group",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="capacity_override",
                        to="academic.group",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="noveltyexecution",
            name="revert_of",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reverted_by",
                to="novelties.noveltyexecution",
            ),
        ),
        migrations.AlterField(
            model_name="noveltycase",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Borrador"),
                    ("FILED", "Radicada"),
                    ("IN_REVIEW", "En revisión"),
                    ("PENDING_DOCS", "Pendiente de documentación"),
                    ("APPROVED", "Aprobada"),
                    ("REJECTED", "Rechazada"),
                    ("EXECUTED", "Ejecutada"),
                    ("REVERTED", "Revertida"),
                    ("CLOSED", "Cerrada"),
                ],
                default="DRAFT",
                max_length=24,
            ),
        ),
        migrations.AddIndex(
            model_name="capacitybucket",
            index=models.Index(fields=["campus", "grade", "academic_year", "shift", "modality"], name="novelties_campus_gra_0a8e7f_idx"),
        ),
    ]
