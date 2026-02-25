from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_passwordresettoken"),
        ("communications", "0002_email_webhook_and_suppression"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254, unique=True)),
                ("marketing_opt_in", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="email_preferences",
                        to="users.user",
                    ),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="EmailPreferenceAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("previous_marketing_opt_in", models.BooleanField()),
                ("new_marketing_opt_in", models.BooleanField()),
                (
                    "source",
                    models.CharField(
                        choices=[("USER", "User"), ("SYSTEM", "System"), ("WEBHOOK", "Webhook")],
                        default="SYSTEM",
                        max_length=20,
                    ),
                ),
                ("notes", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "preference",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="audits",
                        to="communications.emailpreference",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
