from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_passwordresettoken"),
        ("communications", "0004_mailgunsettings"),
    ]

    operations = [
        migrations.CreateModel(
            name="MailgunSettingsAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("changed_fields", models.JSONField(blank=True, default=list)),
                ("rotated_api_key", models.BooleanField(default=False)),
                ("rotated_webhook_signing_key", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "settings_ref",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audits",
                        to="communications.mailgunsettings",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mailgun_settings_audits",
                        to="users.user",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
