from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsCoordinatorOrAdminOrReadOnly(BasePermission):
    """Permite escritura a COORDINATOR/ADMIN/SUPERADMIN; lectura al resto autenticado."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(request.user, "role", None) in {"COORDINATOR", "ADMIN", "SUPERADMIN"}

