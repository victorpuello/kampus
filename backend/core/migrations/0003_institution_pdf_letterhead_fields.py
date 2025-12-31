from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="institution",
            name="pdf_footer_text",
            field=models.CharField(
                blank=True,
                help_text="Texto opcional que aparece en el pie del PDF.",
                max_length=255,
                verbose_name="Pie de página PDF",
            ),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_header_line1",
            field=models.CharField(
                blank=True,
                help_text="Si está vacío, se usa el nombre de la institución.",
                max_length=200,
                verbose_name="Encabezado PDF - Línea 1",
            ),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_header_line2",
            field=models.CharField(
                blank=True,
                help_text="Opcional (ej: lema, sede, etc.).",
                max_length=200,
                verbose_name="Encabezado PDF - Línea 2",
            ),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_header_line3",
            field=models.CharField(
                blank=True,
                help_text="Opcional (ej: municipio/departamento).",
                max_length=200,
                verbose_name="Encabezado PDF - Línea 3",
            ),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_logo_height_px",
            field=models.PositiveSmallIntegerField(default=60, verbose_name="Alto del logo en PDFs (px)"),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_show_logo",
            field=models.BooleanField(default=True, verbose_name="Mostrar escudo/logo en PDFs"),
        ),
        migrations.AddField(
            model_name="institution",
            name="pdf_letterhead_image",
            field=models.ImageField(
                blank=True,
                help_text="Si se define, se usa como encabezado del PDF (ancho completo).",
                null=True,
                upload_to="institutions/letterheads/",
                verbose_name="Imagen de membrete (PDF)",
            ),
        ),
    ]
