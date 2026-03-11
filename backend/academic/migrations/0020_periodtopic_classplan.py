from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0019_commission_commissionstudentdecision_commitmentacta_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PeriodTopic",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255, verbose_name="Temática")),
                ("description", models.TextField(blank=True, verbose_name="Descripción")),
                ("sequence_order", models.PositiveIntegerField(default=1, verbose_name="Orden")),
                ("source", models.CharField(choices=[("MANUAL", "Manual"), ("IMPORT", "Importación")], default="MANUAL", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("academic_load", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="period_topics", to="academic.academicload")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="period_topics_created", to=settings.AUTH_USER_MODEL)),
                ("period", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="topics", to="academic.period")),
            ],
            options={
                "verbose_name": "Temática por Periodo",
                "verbose_name_plural": "Temáticas por Periodo",
                "ordering": ["period__start_date", "academic_load__subject__name", "sequence_order", "title"],
            },
        ),
        migrations.CreateModel(
            name="ClassPlan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255, verbose_name="Título del plan")),
                ("class_date", models.DateField(blank=True, null=True, verbose_name="Fecha de la clase")),
                ("duration_minutes", models.PositiveIntegerField(default=60, verbose_name="Duración")),
                ("learning_result", models.TextField(blank=True, verbose_name="Resultado de aprendizaje")),
                ("dba_reference", models.TextField(blank=True, verbose_name="DBA")),
                ("standard_reference", models.TextField(blank=True, verbose_name="Estándar")),
                ("competency_know", models.TextField(blank=True, verbose_name="Competencia Saber")),
                ("competency_do", models.TextField(blank=True, verbose_name="Competencia Hacer")),
                ("competency_be", models.TextField(blank=True, verbose_name="Competencia Ser")),
                ("class_purpose", models.TextField(blank=True, verbose_name="Propósito de la clase")),
                ("start_time_minutes", models.PositiveIntegerField(default=10, verbose_name="Tiempo inicio")),
                ("start_activities", models.TextField(blank=True, verbose_name="Actividades de inicio")),
                ("development_time_minutes", models.PositiveIntegerField(default=40, verbose_name="Tiempo desarrollo")),
                ("development_activities", models.TextField(blank=True, verbose_name="Actividades de desarrollo")),
                ("closing_time_minutes", models.PositiveIntegerField(default=10, verbose_name="Tiempo cierre")),
                ("closing_activities", models.TextField(blank=True, verbose_name="Actividades de cierre")),
                ("evidence_product", models.TextField(blank=True, verbose_name="Evidencia o producto")),
                ("evaluation_instrument", models.TextField(blank=True, verbose_name="Instrumento de evaluación")),
                ("evaluation_criterion", models.TextField(blank=True, verbose_name="Criterio SIEE")),
                ("resources", models.TextField(blank=True, verbose_name="Recursos")),
                ("dua_adjustments", models.TextField(blank=True, verbose_name="Observaciones o ajustes DUA")),
                ("status", models.CharField(choices=[("DRAFT", "Borrador"), ("FINALIZED", "Finalizado")], default="DRAFT", max_length=20)),
                ("ai_assisted_sections", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="class_plans_created", to=settings.AUTH_USER_MODEL)),
                ("period", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="class_plans", to="academic.period")),
                ("teacher_assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="class_plans", to="academic.teacherassignment")),
                ("topic", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="class_plans", to="academic.periodtopic")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="class_plans_updated", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Plan de Clase",
                "verbose_name_plural": "Planes de Clase",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="periodtopic",
            constraint=models.UniqueConstraint(fields=("period", "academic_load", "sequence_order"), name="uniq_period_topic_order_per_load"),
        ),
        migrations.AddIndex(
            model_name="periodtopic",
            index=models.Index(fields=["period", "academic_load"], name="idx_period_topic_period_load"),
        ),
        migrations.AddIndex(
            model_name="periodtopic",
            index=models.Index(fields=["period", "is_active"], name="idx_period_topic_active"),
        ),
        migrations.AddIndex(
            model_name="classplan",
            index=models.Index(fields=["teacher_assignment", "period"], name="idx_cp_assign_period"),
        ),
        migrations.AddIndex(
            model_name="classplan",
            index=models.Index(fields=["period", "status"], name="idx_class_plan_period_status"),
        ),
    ]