from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="VerifiableDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(db_index=True, max_length=64, unique=True)),
                (
                    "doc_type",
                    models.CharField(
                        choices=[
                            ("STUDY_CERTIFICATE", "Certificado de estudios"),
                            ("STUDY_CERTIFICATION", "Certificación académica"),
                            ("REPORT_CARD", "Boletín / Informe académico"),
                        ],
                        db_index=True,
                        max_length=40,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("ACTIVE", "Activo"), ("REVOKED", "Revocado"), ("EXPIRED", "Expirado")],
                        db_index=True,
                        default="ACTIVE",
                        max_length=10,
                    ),
                ),
                ("issued_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("expires_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("revoked_reason", models.CharField(blank=True, default="", max_length=255)),
                ("seal_hash", models.CharField(blank=True, default="", max_length=128)),
                ("object_type", models.CharField(blank=True, default="", max_length=80)),
                ("object_id", models.CharField(blank=True, default="", max_length=80)),
                ("public_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["doc_type", "issued_at"], name="verification_doc_type_8a3d9b_idx"),
                    models.Index(fields=["status", "issued_at"], name="verification_status_7fe4c3_idx"),
                ],
            },
        ),
    ]
