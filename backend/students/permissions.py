from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsSecretaryOrAdminOrReadOnly(BasePermission):
    """SECRETARY y ADMIN pueden escribir; otros roles solo lectura."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(request.user, "role", None) in {"SECRETARY", "ADMIN", "SUPERADMIN"}
