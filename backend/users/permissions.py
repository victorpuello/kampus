from rest_framework import permissions
from .models import User


class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and request.user.role == User.ROLE_SUPERADMIN
        )


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.ROLE_SUPERADMIN,
            User.ROLE_ADMIN,
        ]


class IsCoordinator(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.ROLE_SUPERADMIN,
            User.ROLE_ADMIN,
            User.ROLE_COORDINATOR,
        ]


class IsSecretary(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.ROLE_SECRETARY


class IsAdministrativeStaff(permissions.BasePermission):
    """Admin-like roles allowed to perform administrative operations."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in [
            User.ROLE_SUPERADMIN,
            User.ROLE_ADMIN,
            User.ROLE_COORDINATOR,
            User.ROLE_SECRETARY,
        ]


class IsTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.ROLE_TEACHER


class IsStudent(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.ROLE_STUDENT


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    Admins can edit anything.
    """

    def has_object_permission(self, request, view, obj):
        if request.user.role in [User.ROLE_SUPERADMIN, User.ROLE_ADMIN]:
            return True
        # Check if the object has a 'user' attribute or is the user itself
        if hasattr(obj, 'user'):
            return obj.user == request.user
        return obj == request.user
