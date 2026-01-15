from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_institution_rector_signature"),
    ]

    operations = [
        migrations.AddField(
            model_name="institution",
            name="certificate_studies_price_cop",
            field=models.PositiveIntegerField(
                default=10000,
                help_text="Precio unitario que se registra al emitir certificados de estudios.",
                verbose_name="Valor certificado de estudios (COP)",
            ),
        ),
    ]
