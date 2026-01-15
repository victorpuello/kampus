from django.db import migrations, models
import students.models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0004_certificateissue"),
    ]

    operations = [
        migrations.AddField(
            model_name="certificateissue",
            name="amount_cop",
            field=models.PositiveIntegerField(
                default=10000,
                help_text="Valor cobrado por este certificado (se guarda al emitir).",
            ),
        ),
        migrations.AddField(
            model_name="certificateissue",
            name="pdf_file",
            field=models.FileField(
                blank=True,
                help_text="Copia del PDF generado para auditoría y re-descarga.",
                null=True,
                upload_to=students.models.certificate_pdf_upload_to,
            ),
        ),
    ]
