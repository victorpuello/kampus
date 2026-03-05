from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_notification_dedupe_key_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationDispatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "channel",
                    models.CharField(
                        choices=[("EMAIL", "Email"), ("WHATSAPP", "WhatsApp")],
                        max_length=20,
                    ),
                ),
                ("idempotency_key", models.CharField(blank=True, db_index=True, default="", max_length=150)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("IN_PROGRESS", "In progress"),
                            ("SUCCEEDED", "Succeeded"),
                            ("FAILED", "Failed"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("next_retry_at", models.DateTimeField(blank=True, null=True)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True, default="")),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "notification",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="dispatches", to="notifications.notification"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["status", "next_retry_at", "created_at"], name="notificatio_status_a86ebf_idx"),
                    models.Index(fields=["notification", "channel", "created_at"], name="notificatio_notific_9a6d57_idx"),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="notificationdispatch",
            constraint=models.UniqueConstraint(
                condition=~models.Q(idempotency_key=""),
                fields=("channel", "idempotency_key"),
                name="notifications_unique_dispatch_channel_idempotency",
            ),
        ),
    ]
