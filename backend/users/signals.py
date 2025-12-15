from __future__ import annotations

from django.apps import apps as django_apps
from django.contrib.auth.management import create_permissions
from django.contrib.auth.models import Group, Permission
from django.db.models.signals import post_migrate
from django.dispatch import receiver


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
    "core",
    "academic",
    "students",
}


def _get_perms(*, using: str, app_labels: set[str], prefixes: list[str]):
    q = Permission.objects.using(using).filter(content_type__app_label__in=app_labels)
    out = Permission.objects.using(using).none()
    for prefix in prefixes:
        out = out | q.filter(codename__startswith=prefix)
    return out.distinct()


def _seed_role_groups_and_permissions(*, using: str) -> None:
    # Ensure permissions exist for our apps (post_migrate receiver ordering isn't guaranteed).
    for app_label in sorted(APP_LABELS | {"auth"}):
        try:
            app_config = django_apps.get_app_config(app_label)
        except LookupError:
            continue
        create_permissions(app_config, verbosity=0, interactive=False, using=using)

    role_groups: dict[str, Group] = {}
    for role in ROLE_NAMES:
        group, _ = Group.objects.using(using).get_or_create(name=role)
        role_groups[role] = group

    view_perms_all = list(_get_perms(using=using, app_labels=READ_APP_LABELS_FOR_ALL, prefixes=["view_"]))
    view_perms_all_apps = list(_get_perms(using=using, app_labels=APP_LABELS, prefixes=["view_"]))

    academic_write = list(
        _get_perms(using=using, app_labels={"academic"}, prefixes=["add_", "change_", "delete_"])
    )
    students_write = list(
        _get_perms(using=using, app_labels={"students"}, prefixes=["add_", "change_", "delete_"])
    )
    core_write = list(_get_perms(using=using, app_labels={"core"}, prefixes=["add_", "change_", "delete_"]))
    teachers_write = list(
        _get_perms(using=using, app_labels={"teachers"}, prefixes=["add_", "change_", "delete_"])
    )
    users_write = list(_get_perms(using=using, app_labels={"users"}, prefixes=["add_", "change_", "delete_"]))

    auth_write = list(
        _get_perms(using=using, app_labels={"auth"}, prefixes=["add_", "change_", "delete_", "view_"])
    )

    for role, group in role_groups.items():
        if view_perms_all:
            group.permissions.add(*view_perms_all)

    all_app_perms = list(
        _get_perms(
            using=using,
            app_labels=APP_LABELS | {"auth"},
            prefixes=["add_", "change_", "delete_", "view_"],
        )
    )
    role_groups["SUPERADMIN"].permissions.add(*all_app_perms)

    role_groups["ADMIN"].permissions.add(
        *view_perms_all_apps,
        *core_write,
        *users_write,
        *teachers_write,
        *students_write,
        *academic_write,
        *auth_write,
    )

    role_groups["COORDINATOR"].permissions.add(*academic_write)
    role_groups["SECRETARY"].permissions.add(*students_write)


@receiver(post_migrate)
def bootstrap_rbac(sender, using: str, **kwargs):
    # Only bootstrap once, and only if no role group has any permissions yet.
    if getattr(sender, "name", None) != "users":
        return

    for role in ROLE_NAMES:
        group = Group.objects.using(using).filter(name=role).first()
        if group is not None and group.permissions.exists():
            return

    _seed_role_groups_and_permissions(using=using)
