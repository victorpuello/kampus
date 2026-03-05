from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0003_notificationdispatch"),
    ]

    operations = [
        migrations.CreateModel(
            name="NotificationType",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=80, unique=True)),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                ("email_enabled", models.BooleanField(default=True)),
                ("whatsapp_enabled", models.BooleanField(default=True)),
                ("whatsapp_requires_template", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["code"],
            },
        ),
        migrations.AlterField(
            model_name="notificationdispatch",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("IN_PROGRESS", "In progress"),
                    ("SUCCEEDED", "Succeeded"),
                    ("FAILED", "Failed"),
                    ("DEAD_LETTER", "Dead letter"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
