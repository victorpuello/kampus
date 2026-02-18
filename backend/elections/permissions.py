from __future__ import annotations

from rest_framework.permissions import BasePermission

from users.models import User


class CanResetElectionToken(BasePermission):
    """Allow contingency token reset for admin-like roles or explicit Django perm."""

    message = "No tienes permisos para resetear tokens de votación."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False

        if user.has_perm("elections.reset_votertoken"):
            return True

        return getattr(user, "role", None) in {
            User.ROLE_SUPERADMIN,
            User.ROLE_ADMIN,
            User.ROLE_COORDINATOR,
            User.ROLE_SECRETARY,
        }


class CanManageElectionSetup(BasePermission):
    message = "No tienes permisos para gestionar la configuración electoral."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False

        return getattr(user, "role", None) in {
            User.ROLE_SUPERADMIN,
            User.ROLE_ADMIN,
        }
