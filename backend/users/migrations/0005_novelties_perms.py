from __future__ import annotations

from django.db import migrations


def _ensure_permissions_exist(using: str) -> None:
    # Permissions are usually created via `post_migrate`, but RunPython operations
    # can execute before that signal runs during `migrate`.
    try:
        from django.apps import apps as django_apps
        from django.contrib.auth.management import create_permissions

        app_config = django_apps.get_app_config("novelties")
        create_permissions(app_config, verbosity=0, interactive=False, using=using)
    except Exception:
        return


ADMIN_PERMISSION_CODENAMES = [
    # Catalog
    "view_noveltytype",
    "add_noveltytype",
    "change_noveltytype",
    "view_noveltyreason",
    "add_noveltyreason",
    "change_noveltyreason",
    # Cases
    "view_noveltycase",
    "add_noveltycase",
    "change_noveltycase",
    "view_noveltycasetransition",
]


SECRETARY_COORDINATOR_PERMISSION_CODENAMES = [
    "view_noveltycase",
    "add_noveltycase",
    "change_noveltycase",
    "view_noveltycasetransition",
]


def grant_novelties_permissions(apps, schema_editor):
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
            codename__in=ADMIN_PERMISSION_CODENAMES,
        )
        if perms.exists():
            admin_group.permissions.add(*perms)

    perms_sc = Permission.objects.using(using).filter(
        content_type__app_label="novelties",
        codename__in=SECRETARY_COORDINATOR_PERMISSION_CODENAMES,
    )
    if not perms_sc.exists():
        return

    if coordinator_group:
        coordinator_group.permissions.add(*perms_sc)

    if secretary_group:
        secretary_group.permissions.add(*perms_sc)


class Migration(migrations.Migration):
    dependencies = [
        ("novelties", "0001_initial"),
        ("users", "0004_discipline_case_perms"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_novelties_permissions, migrations.RunPython.noop),
    ]
