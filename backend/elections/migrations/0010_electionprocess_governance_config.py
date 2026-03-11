from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("elections", "0009_voterecord_evr_proc_created_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="electionprocess",
            name="governance_config",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
