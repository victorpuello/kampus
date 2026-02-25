from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="EmailDelivery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient_email", models.EmailField(max_length=254)),
                ("subject", models.CharField(max_length=255)),
                ("body_text", models.TextField(blank=True, default="")),
                ("body_html", models.TextField(blank=True, default="")),
                ("category", models.CharField(default="transactional", max_length=50)),
                ("provider", models.CharField(default="mailgun", max_length=50)),
                ("provider_message_id", models.CharField(blank=True, default="", max_length=255)),
                ("idempotency_key", models.CharField(blank=True, db_index=True, default="", max_length=150)),
                (
                    "status",
                    models.CharField(
                        choices=[("PENDING", "Pending"), ("SENT", "Sent"), ("FAILED", "Failed")],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("error_message", models.TextField(blank=True, default="")),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="emaildelivery",
            constraint=models.UniqueConstraint(
                condition=models.Q(("idempotency_key", ""), _negated=True),
                fields=("recipient_email", "idempotency_key"),
                name="communications_unique_email_idempotency",
            ),
        ),
    ]
