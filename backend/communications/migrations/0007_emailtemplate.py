from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0006_mailgunsettings_environment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                (
                    "template_type",
                    models.CharField(
                        choices=[("transactional", "Transactional"), ("marketing", "Marketing")],
                        default="transactional",
                        max_length=20,
                    ),
                ),
                ("category", models.CharField(default="transactional", max_length=50)),
                ("subject_template", models.CharField(max_length=255)),
                ("body_text_template", models.TextField(blank=True, default="")),
                ("body_html_template", models.TextField(blank=True, default="")),
                ("allowed_variables", models.JSONField(blank=True, default=list)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="email_templates_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["slug"]},
        ),
    ]
