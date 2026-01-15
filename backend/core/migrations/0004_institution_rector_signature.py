from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_institution_pdf_letterhead_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="institution",
            name="pdf_rector_signature_image",
            field=models.ImageField(
                blank=True,
                help_text="Imagen de la firma para usar en certificados/reportes.",
                null=True,
                upload_to="institutions/signatures/",
                verbose_name="Firma del rector (PDF)",
            ),
        ),
    ]
