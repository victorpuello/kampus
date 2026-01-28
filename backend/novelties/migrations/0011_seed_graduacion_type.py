from django.db import migrations


def seed_graduacion_type(apps, schema_editor):
    NoveltyType = apps.get_model("novelties", "NoveltyType")
    NoveltyReason = apps.get_model("novelties", "NoveltyReason")

    novelty_type, _ = NoveltyType.objects.get_or_create(
        code="graduacion",
        defaults={"name": "Graduación", "is_active": True},
    )

    changed = False
    if novelty_type.name != "Graduación":
        novelty_type.name = "Graduación"
        changed = True
    if novelty_type.is_active is not True:
        novelty_type.is_active = True
        changed = True
    if changed:
        novelty_type.save(update_fields=["name", "is_active", "updated_at"])

    reason, _ = NoveltyReason.objects.get_or_create(
        novelty_type=novelty_type,
        name="Graduación",
        defaults={"is_active": True},
    )
    if reason.is_active is not True:
        reason.is_active = True
        reason.save(update_fields=["is_active", "updated_at"])


def noop_reverse(apps, schema_editor):
    # Intentionally no-op: these catalogs may be edited by admins.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0010_seed_types_and_reasons"),
    ]

    operations = [
        migrations.RunPython(seed_graduacion_type, reverse_code=noop_reverse),
    ]
