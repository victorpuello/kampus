from rest_framework.permissions import BasePermission, DjangoModelPermissions, SAFE_METHODS


class KampusModelPermissions(DjangoModelPermissions):
    """Model permissions based RBAC.

    Uses Django's `auth.Permission` via Groups and `user_permissions`.
    """

    authenticated_users_only = True

    perms_map = {
        "GET": ["%(app_label)s.view_%(model_name)s"],
        "OPTIONS": [],
        "HEAD": ["%(app_label)s.view_%(model_name)s"],
        "POST": ["%(app_label)s.add_%(model_name)s"],
        "PUT": ["%(app_label)s.change_%(model_name)s"],
        "PATCH": ["%(app_label)s.change_%(model_name)s"],
        "DELETE": ["%(app_label)s.delete_%(model_name)s"],
    }


class HasDjangoPermission(BasePermission):
    """Checks a single Django permission codename on the user.

    Set `required_permission = "app_label.codename"` on the view.
    """

    def has_permission(self, request, view):
        perm = getattr(view, "required_permission", None)
        if not perm:
            return False
        return bool(request.user and request.user.is_authenticated and request.user.has_perm(perm))

class IsAdminOrReadOnly(BasePermission):
    """
    Allows access to update only to admin users.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in ['ADMIN', 'SUPERADMIN']
