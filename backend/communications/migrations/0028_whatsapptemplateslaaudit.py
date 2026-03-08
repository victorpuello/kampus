from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0027_whatsappsettings_template_sla_thresholds"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhatsAppTemplateSlaAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("environment", models.CharField(choices=[("development", "Development"), ("production", "Production")], default="development", max_length=20)),
                ("previous_warning_pending_hours", models.PositiveSmallIntegerField(default=24)),
                ("new_warning_pending_hours", models.PositiveSmallIntegerField(default=24)),
                ("previous_critical_pending_hours", models.PositiveSmallIntegerField(default=72)),
                ("new_critical_pending_hours", models.PositiveSmallIntegerField(default=72)),
                ("previous_warning_approval_hours", models.PositiveSmallIntegerField(default=24)),
                ("new_warning_approval_hours", models.PositiveSmallIntegerField(default=24)),
                ("previous_critical_approval_hours", models.PositiveSmallIntegerField(default=72)),
                ("new_critical_approval_hours", models.PositiveSmallIntegerField(default=72)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("settings_ref", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="sla_audits", to="communications.whatsappsettings")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="whatsapp_template_sla_audits", to="users.user")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="whatsapptemplateslaaudit",
            index=models.Index(fields=["environment", "created_at"], name="communicatio_environ_88f0af_idx"),
        ),
    ]
