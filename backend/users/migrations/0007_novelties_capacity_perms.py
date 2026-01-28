from __future__ import annotations

from django.db import migrations


def _ensure_permissions_exist(using: str) -> None:
    try:
        from django.apps import apps as django_apps
        from django.contrib.auth.management import create_permissions

        app_config = django_apps.get_app_config("novelties")
        create_permissions(app_config, verbosity=0, interactive=False, using=using)
    except Exception:
        return


ADMIN_CAPACITY_PERMISSION_CODENAMES = [
    "view_capacitybucket",
    "add_capacitybucket",
    "change_capacitybucket",
    "delete_capacitybucket",
    "view_groupcapacityoverride",
    "add_groupcapacityoverride",
    "change_groupcapacityoverride",
    "delete_groupcapacityoverride",
]


def grant_novelties_capacity_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    using = schema_editor.connection.alias
    _ensure_permissions_exist(using)

    admin_group = Group.objects.using(using).filter(name="ADMIN").first()
    superadmin_group = Group.objects.using(using).filter(name="SUPERADMIN").first()

    perms = Permission.objects.using(using).filter(
        content_type__app_label="novelties",
        codename__in=ADMIN_CAPACITY_PERMISSION_CODENAMES,
    )
    if not perms.exists():
        return

    if admin_group:
        admin_group.permissions.add(*perms)

    if superadmin_group:
        superadmin_group.permissions.add(*perms)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0006_novelties_documents_perms"),
        ("novelties", "0006_capacity_bucket_and_override"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_novelties_capacity_permissions, migrations.RunPython.noop),
    ]
