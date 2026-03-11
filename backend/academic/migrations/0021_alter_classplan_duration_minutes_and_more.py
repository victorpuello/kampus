from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0020_periodtopic_classplan"),
    ]

    operations = [
        migrations.AlterField(
            model_name="classplan",
            name="duration_minutes",
            field=models.PositiveIntegerField(default=55, verbose_name="Duración"),
        ),
        migrations.AlterField(
            model_name="classplan",
            name="development_time_minutes",
            field=models.PositiveIntegerField(default=35, verbose_name="Tiempo desarrollo"),
        ),
    ]
