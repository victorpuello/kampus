from __future__ import annotations

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0004_noveltyattachment_noveltyrequireddocumentrule"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="noveltycase",
            name="idempotency_key",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.CreateModel(
            name="NoveltyExecution",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("idempotency_key", models.CharField(max_length=80)),
                ("executed_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("before_snapshot", models.JSONField(blank=True, default=dict)),
                ("after_snapshot", models.JSONField(blank=True, default=dict)),
                (
                    "case",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="execution", to="novelties.noveltycase"),
                ),
                (
                    "executed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="novelty_executions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="noveltyexecution",
            constraint=models.UniqueConstraint(fields=("idempotency_key",), name="uniq_novelty_execution_idempotency_key"),
        ),
    ]
