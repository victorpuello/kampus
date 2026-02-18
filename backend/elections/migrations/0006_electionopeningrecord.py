from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('elections', '0005_electioncensus_models'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ElectionOpeningRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opened_at', models.DateTimeField(auto_now_add=True)),
                ('votes_count_at_open', models.PositiveIntegerField(default=0)),
                ('blank_votes_count_at_open', models.PositiveIntegerField(default=0)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('opened_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='election_opening_records', to=settings.AUTH_USER_MODEL)),
                ('process', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='opening_record', to='elections.electionprocess')),
            ],
            options={
                'ordering': ['-opened_at', '-id'],
            },
        ),
    ]
