from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("academic", "0013_alter_grade_options_grade_ordinal_and_more"),
        ("teachers", "0003_teacher_photo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TeacherStatisticsAIAnalysis",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "director_mode",
                    models.CharField(
                        choices=[("period", "Periodo"), ("accumulated", "Acumulado")],
                        default="period",
                        max_length=12,
                    ),
                ),
                ("director_group_id", models.IntegerField(default=0)),
                ("passing_score", models.DecimalField(decimal_places=2, max_digits=6)),
                ("context", models.JSONField(blank=True, default=dict)),
                ("analysis", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "academic_year",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teacher_statistics_ai_analyses",
                        to="academic.academicyear",
                    ),
                ),
                (
                    "period",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teacher_statistics_ai_analyses",
                        to="academic.period",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teacher_statistics_ai_analyses",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="teacherstatisticsaianalysis",
            constraint=models.UniqueConstraint(
                fields=(
                    "user",
                    "academic_year",
                    "period",
                    "director_mode",
                    "director_group_id",
                    "passing_score",
                ),
                name="uniq_teacher_stats_ai_scope",
            ),
        ),
    ]
