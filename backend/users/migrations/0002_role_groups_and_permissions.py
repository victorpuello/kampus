from __future__ import annotations

from django.db import migrations


ROLE_NAMES = [
    "SUPERADMIN",
    "ADMIN",
    "COORDINATOR",
    "SECRETARY",
    "TEACHER",
    "PARENT",
    "STUDENT",
]


APP_LABELS = {
    "core",
    "users",
    "students",
    "teachers",
    "academic",
    "communications",
    "discipline",
    "reports",
    "config",
}


READ_APP_LABELS_FOR_ALL = {
    # Matches previous "SAFE_METHODS allowed" behavior on most endpoints.
    "core",
    "academic",
    "students",
}


def _get_perms(Permission, *, app_labels, prefixes):
    q = Permission.objects.filter(content_type__app_label__in=app_labels)
    out = Permission.objects.none()
    for prefix in prefixes:
        out = out | q.filter(codename__startswith=prefix)
    return out.distinct()


def bootstrap_role_groups_and_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    User = apps.get_model("users", "User")

    role_groups = {}
    for role in ROLE_NAMES:
        group, _ = Group.objects.get_or_create(name=role)
        role_groups[role] = group

    # Baseline read access (used when enforcing via DjangoModelPermissions later)
    # NOTE: `users` and `teachers` are sensitive and are NOT granted to all roles by default.
    view_perms_all = list(_get_perms(Permission, app_labels=READ_APP_LABELS_FOR_ALL, prefixes=["view_"]))
    view_perms_all_apps = list(_get_perms(Permission, app_labels=APP_LABELS, prefixes=["view_"]))

    # Write perms
    academic_write = list(
        _get_perms(Permission, app_labels={"academic"}, prefixes=["add_", "change_", "delete_"])
    )
    students_write = list(
        _get_perms(Permission, app_labels={"students"}, prefixes=["add_", "change_", "delete_"])
    )
    core_write = list(
        _get_perms(Permission, app_labels={"core"}, prefixes=["add_", "change_", "delete_"])
    )
    teachers_write = list(
        _get_perms(Permission, app_labels={"teachers"}, prefixes=["add_", "change_", "delete_"])
    )
    users_write = list(
        _get_perms(Permission, app_labels={"users"}, prefixes=["add_", "change_", "delete_"])
    )

    # Allow admins/superadmins to manage auth Groups/Permissions via admin/API if desired.
    auth_write = list(
        _get_perms(Permission, app_labels={"auth"}, prefixes=["add_", "change_", "delete_", "view_"])
    )

    # Everyone gets baseline read perms for non-sensitive apps.
    for role, group in role_groups.items():
        if view_perms_all:
            group.permissions.add(*view_perms_all)

    # Align with current role-based permissions in code.
    # SUPERADMIN: everything (within our apps + auth)
    all_app_perms = list(
        _get_perms(
            Permission,
            app_labels=APP_LABELS | {"auth"},
            prefixes=["add_", "change_", "delete_", "view_"],
        )
    )
    role_groups["SUPERADMIN"].permissions.add(*all_app_perms)

    # ADMIN: full management for core/users/teachers/students/academic + auth
    role_groups["ADMIN"].permissions.add(
        *view_perms_all_apps,
        *core_write,
        *users_write,
        *teachers_write,
        *students_write,
        *academic_write,
        *auth_write,
    )

    # COORDINATOR: academic write
    role_groups["COORDINATOR"].permissions.add(*academic_write)

    # SECRETARY: students write
    role_groups["SECRETARY"].permissions.add(*students_write)

    # TEACHER/PARENT/STUDENT: view-only (already added)

    # Assign users to their role group; keep other non-role groups intact.
    other_role_groups_by_role = {
        r: [role_groups[o] for o in ROLE_NAMES if o != r] for r in ROLE_NAMES
    }
    for user in User.objects.all().iterator():
        role = getattr(user, "role", None)
        if role not in role_groups:
            continue
        user.groups.add(role_groups[role])
        user.groups.remove(*other_role_groups_by_role[role])


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(bootstrap_role_groups_and_permissions, migrations.RunPython.noop),
    ]
