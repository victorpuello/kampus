from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0026_whatsapptemplatemap_approval_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappsettings",
            name="template_sla_warning_pending_hours",
            field=models.PositiveSmallIntegerField(default=24),
        ),
        migrations.AddField(
            model_name="whatsappsettings",
            name="template_sla_critical_pending_hours",
            field=models.PositiveSmallIntegerField(default=72),
        ),
        migrations.AddField(
            model_name="whatsappsettings",
            name="template_sla_warning_approval_hours",
            field=models.PositiveSmallIntegerField(default=24),
        ),
        migrations.AddField(
            model_name="whatsappsettings",
            name="template_sla_critical_approval_hours",
            field=models.PositiveSmallIntegerField(default=72),
        ),
    ]
