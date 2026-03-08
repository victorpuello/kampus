from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0007_rename_notificatio_is_acti_5fb763_idx_notificatio_is_acti_a4128b_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="operationalplanactivity",
            name="end_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="operationalplanactivity",
            index=models.Index(fields=["is_active", "end_date"], name="notificatio_is_acti_8d7314_idx"),
        ),
    ]
