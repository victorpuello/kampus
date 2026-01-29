from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("teachers", "0004_teacherstatisticsaianalysis"),
    ]

    operations = [
        migrations.AddField(
            model_name="teacher",
            name="photo_thumb",
            field=models.ImageField(
                blank=True,
                editable=False,
                null=True,
                upload_to="teacher_photos/thumbs/",
                verbose_name="Miniatura",
            ),
        ),
    ]
