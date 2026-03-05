from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0011_whatsappsettings"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsappdelivery",
            name="skip_reason",
            field=models.CharField(
                blank=True,
                choices=[
                    ("NO_TEMPLATE", "No template"),
                    ("NO_CONTACT", "No contact"),
                    ("SUPPRESSED", "Suppressed"),
                    ("DISABLED", "Disabled"),
                    ("THROTTLED", "Throttled"),
                ],
                default="",
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="whatsappdelivery",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("SENT", "Sent"),
                    ("DELIVERED", "Delivered"),
                    ("READ", "Read"),
                    ("FAILED", "Failed"),
                    ("SUPPRESSED", "Suppressed"),
                    ("SKIPPED", "Skipped"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
