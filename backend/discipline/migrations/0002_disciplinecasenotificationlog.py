from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0002_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("discipline", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="DisciplineCaseNotificationLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("channel", models.CharField(blank=True, default="", max_length=30)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("REGISTERED", "Registrada"),
                            ("SENT", "Enviada"),
                            ("FAILED", "Fallida"),
                            ("DELIVERED", "Entregada"),
                            ("READ", "Leída"),
                            ("ACKNOWLEDGED", "Enterado/Acuse"),
                        ],
                        default="REGISTERED",
                        max_length=20,
                    ),
                ),
                ("recipient_name", models.CharField(blank=True, default="", max_length=200)),
                (
                    "recipient_contact",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Teléfono/correo u otro identificador del destinatario.",
                        max_length=200,
                    ),
                ),
                ("note", models.TextField(blank=True, default="")),
                ("external_id", models.CharField(blank=True, default="", max_length=100)),
                ("error", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                (
                    "acknowledged_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_notification_logs_acknowledged",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_logs",
                        to="discipline.disciplinecase",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_notification_logs_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "recipient_family_member",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_notifications",
                        to="students.familymember",
                    ),
                ),
                (
                    "recipient_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="discipline_case_notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="disciplinecasenotificationlog",
            index=models.Index(fields=["case", "created_at"], name="discipline__case_id_3a7830_idx"),
        ),
        migrations.AddIndex(
            model_name="disciplinecasenotificationlog",
            index=models.Index(fields=["recipient_user", "created_at"], name="discipline__recipie_f926e4_idx"),
        ),
    ]
