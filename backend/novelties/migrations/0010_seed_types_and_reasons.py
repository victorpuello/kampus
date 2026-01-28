from django.db import migrations


def seed_novelty_catalogs(apps, schema_editor):
    NoveltyType = apps.get_model("novelties", "NoveltyType")
    NoveltyReason = apps.get_model("novelties", "NoveltyReason")

    # Minimal set required by execution MVP and UI.
    # Codes are referenced in backend execution logic.
    types = [
        {"code": "retiro", "name": "Retiro", "is_active": True},
        {"code": "reingreso", "name": "Reingreso", "is_active": True},
        {"code": "cambio_interno", "name": "Cambio interno", "is_active": True},
    ]

    type_by_code = {}
    for t in types:
        obj, _ = NoveltyType.objects.get_or_create(
            code=t["code"],
            defaults={"name": t["name"], "is_active": t["is_active"]},
        )
        # Keep names/active flags aligned if they already exist.
        changed = False
        if obj.name != t["name"]:
            obj.name = t["name"]
            changed = True
        if obj.is_active != t["is_active"]:
            obj.is_active = t["is_active"]
            changed = True
        if changed:
            obj.save(update_fields=["name", "is_active", "updated_at"])
        type_by_code[t["code"]] = obj

    reasons = [
        ("retiro", "Voluntario"),
        ("retiro", "Disciplinario"),
        ("reingreso", "Reingreso"),
        ("cambio_interno", "Cambio de grupo"),
    ]

    for type_code, name in reasons:
        novelty_type = type_by_code.get(type_code)
        if not novelty_type:
            continue
        obj, _ = NoveltyReason.objects.get_or_create(
            novelty_type=novelty_type,
            name=name,
            defaults={"is_active": True},
        )
        if obj.is_active is not True:
            obj.is_active = True
            obj.save(update_fields=["is_active", "updated_at"])


def noop_reverse(apps, schema_editor):
    # Intentionally no-op: these catalogs may be edited by admins.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0009_remove_noveltyexecution_revert_of"),
    ]

    operations = [
        migrations.RunPython(seed_novelty_catalogs, reverse_code=noop_reverse),
    ]
