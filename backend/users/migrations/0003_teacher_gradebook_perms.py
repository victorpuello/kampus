from __future__ import annotations

from django.db import migrations


def _ensure_permissions_exist(using: str) -> None:
    # Permissions are usually created via `post_migrate`, but RunPython operations
    # can execute before that signal runs during `migrate`.
    try:
        from django.apps import apps as django_apps
        from django.contrib.auth.management import create_permissions

        app_config = django_apps.get_app_config("academic")
        create_permissions(app_config, verbosity=0, interactive=False, using=using)
    except Exception:
        return


GRADEBOOK_PERMISSION_CODENAMES = [
    "view_gradesheet",
    "add_gradesheet",
    "change_gradesheet",
    "view_achievementgrade",
    "add_achievementgrade",
    "change_achievementgrade",
]


def grant_teacher_gradebook_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    _ensure_permissions_exist(schema_editor.connection.alias)

    teacher_group = Group.objects.filter(name="TEACHER").first()
    if not teacher_group:
        return

    perms = Permission.objects.filter(
        content_type__app_label="academic",
        codename__in=GRADEBOOK_PERMISSION_CODENAMES,
    )
    if perms.exists():
        teacher_group.permissions.add(*perms)


class Migration(migrations.Migration):
    dependencies = [
        ("academic", "0011_gradebook_models"),
        ("users", "0002_role_groups_and_permissions"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_teacher_gradebook_permissions, migrations.RunPython.noop),
    ]
