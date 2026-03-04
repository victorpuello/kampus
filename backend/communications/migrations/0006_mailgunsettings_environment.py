from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0005_mailgunsettingsaudit"),
    ]

    operations = [
        migrations.AddField(
            model_name="mailgunsettings",
            name="environment",
            field=models.CharField(
                choices=[("development", "Development"), ("production", "Production")],
                default="development",
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name="mailgunsettings",
            constraint=models.UniqueConstraint(
                fields=("environment",),
                name="communications_unique_mailgun_settings_environment",
            ),
        ),
    ]
