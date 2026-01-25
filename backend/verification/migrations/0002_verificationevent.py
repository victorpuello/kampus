from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("verification", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="VerificationEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("token_hash", models.CharField(db_index=True, max_length=64)),
                ("token_prefix", models.CharField(blank=True, default="", max_length=16)),
                ("doc_type", models.CharField(blank=True, db_index=True, default="", max_length=40)),
                ("status", models.CharField(blank=True, db_index=True, default="", max_length=10)),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("NOT_FOUND", "No encontrado"),
                            ("VALID", "Válido"),
                            ("REVOKED", "Revocado"),
                            ("EXPIRED", "Expirado"),
                            ("INVALID", "Inválido"),
                        ],
                        db_index=True,
                        max_length=12,
                    ),
                ),
                ("ip_address", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("user_agent", models.CharField(blank=True, default="", max_length=255)),
                ("path", models.CharField(blank=True, default="", max_length=255)),
                ("accept", models.CharField(blank=True, default="", max_length=128)),
            ],
        ),
    ]
