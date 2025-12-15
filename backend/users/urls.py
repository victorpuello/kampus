from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RbacPermissionsView,
    RbacRolePermissionsView,
    RbacRolesView,
    RbacUserPermissionsView,
    UserViewSet,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")

urlpatterns = [
    path("rbac/roles/", RbacRolesView.as_view(), name="rbac-roles"),
    path("rbac/permissions/", RbacPermissionsView.as_view(), name="rbac-permissions"),
    path(
        "rbac/roles/<str:role>/permissions/",
        RbacRolePermissionsView.as_view(),
        name="rbac-role-permissions",
    ),
    path(
        "rbac/users/<int:user_id>/permissions/",
        RbacUserPermissionsView.as_view(),
        name="rbac-user-permissions",
    ),
    path("", include(router.urls)),
]
