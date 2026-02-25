from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_passwordresettoken"),
        ("communications", "0003_preferences_and_audits"),
    ]

    operations = [
        migrations.CreateModel(
            name="MailgunSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kampus_email_backend",
                    models.CharField(
                        choices=[("console", "Console"), ("mailgun", "Mailgun")],
                        default="console",
                        max_length=20,
                    ),
                ),
                ("default_from_email", models.EmailField(default="no-reply@localhost", max_length=254)),
                ("server_email", models.EmailField(default="no-reply@localhost", max_length=254)),
                ("mailgun_api_key", models.CharField(blank=True, default="", max_length=255)),
                ("mailgun_sender_domain", models.CharField(blank=True, default="", max_length=255)),
                ("mailgun_api_url", models.URLField(blank=True, default="")),
                ("mailgun_webhook_signing_key", models.CharField(blank=True, default="", max_length=255)),
                ("mailgun_webhook_strict", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mailgun_settings_updates",
                        to="users.user",
                    ),
                ),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
    ]
