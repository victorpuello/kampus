from __future__ import annotations

from django.db import migrations


def _ensure_permissions_exist(using: str) -> None:
    # Permissions are usually created via `post_migrate`, but RunPython operations
    # can execute before that signal runs during `migrate`.
    try:
        from django.apps import apps as django_apps
        from django.contrib.auth.management import create_permissions

        app_config = django_apps.get_app_config("discipline")
        create_permissions(app_config, verbosity=0, interactive=False, using=using)
    except Exception:
        return


DISCIPLINE_CASE_PERMISSION_CODENAMES = [
    "view_disciplinecase",
    "add_disciplinecase",
    "change_disciplinecase",
]


def grant_discipline_case_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    _ensure_permissions_exist(schema_editor.connection.alias)

    teacher_group = Group.objects.filter(name="TEACHER").first()
    coordinator_group = Group.objects.filter(name="COORDINATOR").first()

    perms = Permission.objects.filter(
        content_type__app_label="discipline",
        codename__in=DISCIPLINE_CASE_PERMISSION_CODENAMES,
    )
    if not perms.exists():
        return

    if teacher_group:
        teacher_group.permissions.add(*perms)

    if coordinator_group:
        coordinator_group.permissions.add(*perms)


class Migration(migrations.Migration):
    dependencies = [
        ("discipline", "0001_initial"),
        ("users", "0003_teacher_gradebook_perms"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_discipline_case_permissions, migrations.RunPython.noop),
    ]
