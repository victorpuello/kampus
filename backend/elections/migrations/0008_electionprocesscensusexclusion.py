import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("elections", "0007_electioncandidate_student_refs"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ElectionProcessCensusExclusion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.CharField(blank=True, max_length=300)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "census_member",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="process_exclusions", to="elections.electioncensusmember"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="election_census_exclusions_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "process",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="census_exclusions", to="elections.electionprocess"),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("process", "census_member"),
                        name="uniq_election_process_census_exclusion",
                    )
                ],
            },
        ),
    ]
