from __future__ import annotations

from django.db import migrations, models


def _blank_document_numbers_to_null(apps, schema_editor):
    Teacher = apps.get_model("teachers", "Teacher")
    Teacher.objects.filter(document_number="").update(document_number=None)


class Migration(migrations.Migration):
    dependencies = [
        ("teachers", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="teacher",
            name="document_number",
            field=models.CharField(
                max_length=50,
                blank=True,
                null=True,
                unique=True,
                verbose_name="Número de documento",
            ),
        ),
        migrations.RunPython(_blank_document_numbers_to_null, migrations.RunPython.noop),
    ]
