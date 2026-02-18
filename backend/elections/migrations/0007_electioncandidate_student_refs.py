from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('elections', '0006_electionopeningrecord'),
    ]

    operations = [
        migrations.AddField(
            model_name='electioncandidate',
            name='student_document_number',
            field=models.CharField(blank=True, db_index=True, max_length=60),
        ),
        migrations.AddField(
            model_name='electioncandidate',
            name='student_id_ref',
            field=models.PositiveIntegerField(blank=True, db_index=True, null=True),
        ),
    ]
