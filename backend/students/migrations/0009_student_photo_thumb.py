from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0008_observerannotation"),
    ]

    operations = [
        migrations.AddField(
            model_name="student",
            name="photo_thumb",
            field=models.ImageField(
                blank=True,
                editable=False,
                null=True,
                upload_to="student_photos/thumbs/",
                verbose_name="Miniatura",
            ),
        ),
    ]
