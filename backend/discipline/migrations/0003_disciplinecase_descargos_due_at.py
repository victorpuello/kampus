from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("discipline", "0002_disciplinecasenotificationlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="disciplinecase",
            name="descargos_due_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Fecha límite descargos"),
        ),
    ]
