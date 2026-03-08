from django.db import migrations, models


def set_existing_maps_as_approved(apps, schema_editor):
    WhatsAppTemplateMap = apps.get_model("communications", "WhatsAppTemplateMap")
    WhatsAppTemplateMap.objects.all().update(approval_status="approved")


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0025_whatsappdelivery_skipped_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="approval_status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("submitted", "Submitted"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="whatsapp_template_maps_approved",
                to="users.user",
            ),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="rejected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="rejected_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="whatsapp_template_maps_rejected",
                to="users.user",
            ),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="rejection_reason",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="whatsapptemplatemap",
            name="submitted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="whatsapp_template_maps_submitted",
                to="users.user",
            ),
        ),
        migrations.AddIndex(
            model_name="whatsapptemplatemap",
            index=models.Index(
                fields=["approval_status", "is_active", "notification_type"],
                name="communicatio_approva_becfe2_idx",
            ),
        ),
        migrations.RunPython(set_existing_maps_as_approved, migrations.RunPython.noop),
    ]
