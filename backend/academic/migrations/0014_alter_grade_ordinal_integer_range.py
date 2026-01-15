from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0013_alter_grade_options_grade_ordinal_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="grade",
            name="ordinal",
            field=models.IntegerField(
                blank=True,
                help_text="Orden de progresión institucional (permitido: -2 a 11).",
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(-2),
                    django.core.validators.MaxValueValidator(11),
                ],
            ),
        ),
    ]
