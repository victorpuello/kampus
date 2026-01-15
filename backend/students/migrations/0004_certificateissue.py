from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0003_enrollment_enrolled_at_conditionalpromotionplan"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CertificateIssue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("uuid", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                (
                    "certificate_type",
                    models.CharField(
                        choices=[("STUDIES", "Certificado de estudios")],
                        default="STUDIES",
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("ISSUED", "Emitido"), ("REVOKED", "Revocado")],
                        default="ISSUED",
                        max_length=10,
                    ),
                ),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("seal_hash", models.CharField(blank=True, max_length=64)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("revoke_reason", models.TextField(blank=True)),
                (
                    "enrollment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issued_certificates",
                        to="students.enrollment",
                    ),
                ),
                (
                    "issued_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issued_certificates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-issued_at"],
            },
        ),
        migrations.AddIndex(
            model_name="certificateissue",
            index=models.Index(fields=["uuid"], name="idx_cert_issue_uuid"),
        ),
        migrations.AddIndex(
            model_name="certificateissue",
            index=models.Index(fields=["certificate_type", "status"], name="idx_cert_issue_type_status"),
        ),
    ]
