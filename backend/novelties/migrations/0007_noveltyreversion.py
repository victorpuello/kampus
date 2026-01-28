from __future__ import annotations

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0006_capacity_bucket_and_override"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="NoveltyReversion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reverted_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("comment", models.TextField(blank=True, default="")),
                ("before_snapshot", models.JSONField(blank=True, default=dict)),
                ("after_snapshot", models.JSONField(blank=True, default=dict)),
                (
                    "case",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reversion",
                        to="novelties.noveltycase",
                    ),
                ),
                (
                    "reverted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="novelty_reversions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-reverted_at"],
            },
        ),
    ]
