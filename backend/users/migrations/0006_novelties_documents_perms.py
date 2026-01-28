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


ADMIN_DOC_PERMISSION_CODENAMES = [
    # Rules/catalog
    "view_noveltyrequireddocumentrule",
    "add_noveltyrequireddocumentrule",
    "change_noveltyrequireddocumentrule",
    "delete_noveltyrequireddocumentrule",
    # Attachments
    "view_noveltyattachment",
    "add_noveltyattachment",
    "change_noveltyattachment",
    "delete_noveltyattachment",
]


COORDINATOR_SECRETARY_DOC_PERMISSION_CODENAMES = [
    # Attachments (operate cases)
    "view_noveltyattachment",
    "add_noveltyattachment",
    "change_noveltyattachment",
    "delete_noveltyattachment",
    # Read rules
    "view_noveltyrequireddocumentrule",
]


def grant_novelties_documents_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    using = schema_editor.connection.alias
    _ensure_permissions_exist(using)

    admin_group = Group.objects.using(using).filter(name="ADMIN").first()
    coordinator_group = Group.objects.using(using).filter(name="COORDINATOR").first()
    secretary_group = Group.objects.using(using).filter(name="SECRETARY").first()

    if admin_group:
        perms = Permission.objects.using(using).filter(
            content_type__app_label="novelties",
            codename__in=ADMIN_DOC_PERMISSION_CODENAMES,
        )
        if perms.exists():
            admin_group.permissions.add(*perms)

    perms_cs = Permission.objects.using(using).filter(
        content_type__app_label="novelties",
        codename__in=COORDINATOR_SECRETARY_DOC_PERMISSION_CODENAMES,
    )
    if not perms_cs.exists():
        return

    if coordinator_group:
        coordinator_group.permissions.add(*perms_cs)

    if secretary_group:
        secretary_group.permissions.add(*perms_cs)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_novelties_perms"),
        ("novelties", "0003_noveltyradicadocounter_noveltycase_filed_at_and_more"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_novelties_documents_permissions, migrations.RunPython.noop),
    ]
