from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="emaildelivery",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("SENT", "Sent"),
                    ("FAILED", "Failed"),
                    ("SUPPRESSED", "Suppressed"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="EmailEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(default="mailgun", max_length=50)),
                ("provider_event_id", models.CharField(blank=True, db_index=True, default="", max_length=255)),
                ("event_type", models.CharField(max_length=50)),
                ("recipient_email", models.EmailField(blank=True, default="", max_length=254)),
                ("provider_message_id", models.CharField(blank=True, default="", max_length=255)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("processed_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-processed_at"]},
        ),
        migrations.CreateModel(
            name="EmailSuppression",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254, unique=True)),
                (
                    "reason",
                    models.CharField(
                        choices=[
                            ("HARD_BOUNCE", "Hard bounce"),
                            ("SOFT_BOUNCE", "Soft bounce"),
                            ("COMPLAINT", "Complaint"),
                            ("UNSUBSCRIBED", "Unsubscribed"),
                        ],
                        max_length=30,
                    ),
                ),
                ("provider", models.CharField(default="mailgun", max_length=50)),
                ("source_event_id", models.CharField(blank=True, default="", max_length=255)),
                ("failure_count", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="emailevent",
            constraint=models.UniqueConstraint(
                condition=models.Q(("provider_event_id", ""), _negated=True),
                fields=("provider", "provider_event_id"),
                name="communications_unique_provider_event_id",
            ),
        ),
    ]
