from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('elections', '0004_candidatocontraloria_candidatopersoneria'),
    ]

    operations = [
        migrations.CreateModel(
            name='ElectionCensusSync',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_name', models.CharField(default='institutional_api', max_length=120)),
                ('mode', models.CharField(choices=[('DRY_RUN', 'Simulación'), ('APPLY', 'Aplicado')], default='DRY_RUN', max_length=20)),
                ('status', models.CharField(choices=[('SUCCESS', 'Exitoso'), ('PARTIAL', 'Parcial'), ('FAILED', 'Fallido')], default='SUCCESS', max_length=20)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('received_count', models.PositiveIntegerField(default=0)),
                ('created_count', models.PositiveIntegerField(default=0)),
                ('updated_count', models.PositiveIntegerField(default=0)),
                ('deactivated_count', models.PositiveIntegerField(default=0)),
                ('unchanged_count', models.PositiveIntegerField(default=0)),
                ('errors_count', models.PositiveIntegerField(default=0)),
                ('summary', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'ordering': ['-started_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='ElectionCensusMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_external_id', models.CharField(db_index=True, max_length=120, unique=True)),
                ('document_number', models.CharField(blank=True, max_length=60)),
                ('full_name', models.CharField(blank=True, max_length=220)),
                ('grade', models.CharField(blank=True, max_length=30)),
                ('shift', models.CharField(blank=True, max_length=40)),
                ('campus', models.CharField(blank=True, max_length=120)),
                ('status', models.CharField(choices=[('ACTIVE', 'Activo'), ('INACTIVE', 'Inactivo')], default='ACTIVE', max_length=20)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('last_sync', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='members', to='elections.electioncensussync')),
            ],
            options={
                'ordering': ['student_external_id'],
            },
        ),
        migrations.CreateModel(
            name='ElectionCensusChangeEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_external_id', models.CharField(db_index=True, max_length=120)),
                ('change_type', models.CharField(choices=[('CREATE', 'Alta'), ('UPDATE', 'Actualización'), ('DEACTIVATE', 'Desactivación'), ('REACTIVATE', 'Reactivación')], max_length=20)),
                ('before_payload', models.JSONField(blank=True, default=dict)),
                ('after_payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('member', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='change_events', to='elections.electioncensusmember')),
                ('sync', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='elections.electioncensussync')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
