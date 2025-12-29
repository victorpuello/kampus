from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("teachers", "0002_alter_teacher_document_number_nullable"),
    ]

    operations = [
        migrations.AddField(
            model_name="teacher",
            name="photo",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="teacher_photos/",
                verbose_name="Foto",
            ),
        ),
    ]
