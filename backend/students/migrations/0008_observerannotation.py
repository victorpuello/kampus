from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0015_gradebook_activity_mode"),
        ("students", "0007_familymember_identity_document"),
    ]

    operations = [
        migrations.CreateModel(
            name="ObserverAnnotation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "annotation_type",
                    models.CharField(
                        choices=[
                            ("PRAISE", "Felicitación"),
                            ("OBSERVATION", "Observación"),
                            ("ALERT", "Llamado de atención"),
                            ("COMMITMENT", "Compromiso"),
                        ],
                        default="OBSERVATION",
                        max_length=20,
                    ),
                ),
                ("title", models.CharField(blank=True, max_length=200)),
                ("text", models.TextField()),
                ("commitments", models.TextField(blank=True)),
                ("commitment_due_date", models.DateField(blank=True, null=True)),
                ("commitment_responsible", models.CharField(blank=True, max_length=120)),
                ("is_automatic", models.BooleanField(default=False)),
                (
                    "rule_key",
                    models.CharField(
                        blank=True,
                        help_text="Clave para idempotencia en anotaciones automáticas (por estudiante+periodo).",
                        max_length=200,
                        null=True,
                    ),
                ),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("is_deleted", models.BooleanField(default=False)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="observer_annotations_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "deleted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="observer_annotations_deleted",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "period",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="observer_annotations",
                        to="academic.period",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="observer_annotations",
                        to="students.student",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="observer_annotations_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddConstraint(
            model_name="observerannotation",
            constraint=models.UniqueConstraint(
                fields=("student", "period", "rule_key"),
                condition=Q(rule_key__isnull=False) & Q(is_deleted=False),
                name="uniq_observer_annotation_rule_per_student_period",
            ),
        ),
    ]
