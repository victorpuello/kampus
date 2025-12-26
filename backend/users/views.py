from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework import permissions, status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import User
from .serializers import UserSerializer, UserCreateSerializer, UserAdminSerializer, UserSetPasswordSerializer, UserChangePasswordSerializer
from .permissions import IsAdmin, IsOwnerOrAdmin
from core.permissions import KampusModelPermissions
from .pagination import UserPagination


RBAC_APP_LABELS = {
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


def _is_superadmin(user) -> bool:
    return getattr(user, "role", None) == User.ROLE_SUPERADMIN


def _is_admin_or_superadmin(user) -> bool:
    return getattr(user, "role", None) in {User.ROLE_SUPERADMIN, User.ROLE_ADMIN}


def _assert_can_manage_role(request_user: User, target_role: str) -> Response | None:
    if _is_superadmin(request_user):
        return None
    if getattr(request_user, "role", None) == User.ROLE_ADMIN and target_role == User.ROLE_SUPERADMIN:
        return Response({"detail": "Solo SUPERADMIN puede modificar el rol SUPERADMIN."}, status=403)
    return None


def _assert_can_manage_user(request_user: User, target_user: User) -> Response | None:
    if _is_superadmin(request_user):
        return None
    if getattr(request_user, "role", None) == User.ROLE_ADMIN and target_user.role == User.ROLE_SUPERADMIN:
        return Response({"detail": "Solo SUPERADMIN puede modificar usuarios SUPERADMIN."}, status=403)
    return None


def _get_assignable_permissions_for(request_user: User):
    app_labels = set(RBAC_APP_LABELS)
    # Only SUPERADMIN can assign auth.* permissions.
    if _is_superadmin(request_user):
        app_labels.add("auth")
    return Permission.objects.filter(content_type__app_label__in=app_labels)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    permission_classes = [KampusModelPermissions]
    pagination_class = UserPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name", "email"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        
        if self.action in ["update", "partial_update"]:
            # If user is admin, allow role update via UserAdminSerializer
            if self.request.user.role in [User.ROLE_SUPERADMIN, User.ROLE_ADMIN]:
                return UserAdminSerializer

        return UserSerializer

    def get_permissions(self):
        if self.action in ["list", "create", "destroy", "all", "set_password"]:
            return [IsAdmin()]
        if self.action in ["retrieve", "update", "partial_update", "me", "change_password"]:
            # Allow users to see/edit themselves
            if self.action == "me":
                return [permissions.IsAuthenticated()]
            if self.action == "change_password":
                return [permissions.IsAuthenticated()]
            return [permissions.IsAuthenticated(), IsOwnerOrAdmin()]
        return super().get_permissions()

    @action(
        detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated]
    )
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(
        detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated]
    )
    def change_password(self, request):
        serializer = UserChangePasswordSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data["current_password"]
        new_password = serializer.validated_data["new_password"]

        if not request.user.check_password(current_password):
            return Response(
                {"detail": "La contraseña actual no es correcta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        return Response({"detail": "Contraseña actualizada."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def all(self, request):
        """Return the full user list (unpaginated).

        Used by internal screens that need all users (e.g., select inputs).
        Respects the same permissions and supports the same SearchFilter.
        """

        qs = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(
        detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated]
    )
    def rectors(self, request):
        """Get users eligible to be rector (ADMIN or TEACHER roles)"""
        users = User.objects.filter(
            role__in=[User.ROLE_ADMIN, User.ROLE_TEACHER],
            is_active=True
        ).order_by('first_name', 'last_name')
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    @action(
        detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated]
    )
    def secretaries(self, request):
        """Get users eligible to be secretary (SECRETARY role)"""
        users = User.objects.filter(
            role=User.ROLE_SECRETARY,
            is_active=True
        ).order_by('first_name', 'last_name')
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    @action(
        detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated]
    )
    def coordinators(self, request):
        """Get users eligible to be coordinator (COORDINATOR role)"""
        users = User.objects.filter(
            role=User.ROLE_COORDINATOR,
            is_active=True
        ).order_by('first_name', 'last_name')
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdmin])
    def set_password(self, request, pk=None):
        target = self.get_object()

        deny = _assert_can_manage_user(request.user, target)
        if deny is not None:
            return deny

        serializer = UserSetPasswordSerializer(data=request.data, context={"user": target})
        serializer.is_valid(raise_exception=True)
        target.set_password(serializer.validated_data["password"])
        target.save(update_fields=["password"])
        return Response({"detail": "Contraseña actualizada."}, status=status.HTTP_200_OK)


class RbacRolesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        roles = []
        for value, label in User.ROLES:
            roles.append({"role": value, "label": label, "group": value})
        return Response({"roles": roles})


class RbacPermissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        perms = _get_assignable_permissions_for(request.user).select_related("content_type").order_by(
            "content_type__app_label",
            "content_type__model",
            "codename",
        )

        data = [
            {
                "id": p.id,
                "codename": p.codename,
                "name": p.name,
                "app_label": p.content_type.app_label,
                "model": p.content_type.model,
            }
            for p in perms
        ]
        return Response({"permissions": data})


class RbacRolePermissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, role: str):
        if role not in {r for r, _ in User.ROLES}:
            return Response({"detail": "Rol inválido."}, status=400)
        deny = _assert_can_manage_role(request.user, role)
        if deny is not None:
            return deny

        group, _ = Group.objects.get_or_create(name=role)
        perms = group.permissions.select_related("content_type").order_by(
            "content_type__app_label", "content_type__model", "codename"
        )
        return Response(
            {
                "role": role,
                "permission_ids": [p.id for p in perms],
            }
        )

    def put(self, request, role: str):
        if role not in {r for r, _ in User.ROLES}:
            return Response({"detail": "Rol inválido."}, status=400)
        deny = _assert_can_manage_role(request.user, role)
        if deny is not None:
            return deny

        permission_ids = request.data.get("permission_ids")
        if not isinstance(permission_ids, list) or not all(isinstance(x, int) for x in permission_ids):
            return Response({"detail": "permission_ids debe ser una lista de enteros."}, status=400)

        assignable = _get_assignable_permissions_for(request.user)
        perms = list(assignable.filter(id__in=permission_ids))
        if len(perms) != len(set(permission_ids)):
            return Response({"detail": "Incluiste permisos no permitidos o inexistentes."}, status=400)

        group, _ = Group.objects.get_or_create(name=role)
        group.permissions.set(perms)
        return Response({"role": role, "permission_ids": [p.id for p in perms]})


class RbacUserPermissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, user_id: int):
        target = User.objects.filter(id=user_id).first()
        if target is None:
            return Response({"detail": "Usuario no encontrado."}, status=404)

        deny = _assert_can_manage_user(request.user, target)
        if deny is not None:
            return deny

        role_group, _ = Group.objects.get_or_create(name=target.role)
        role_perm_ids = list(role_group.permissions.values_list("id", flat=True))
        user_perm_ids = list(target.user_permissions.values_list("id", flat=True))
        effective_ids = sorted(set(role_perm_ids) | set(user_perm_ids))

        return Response(
            {
                "user_id": target.id,
                "role": target.role,
                "role_permission_ids": role_perm_ids,
                "user_permission_ids": user_perm_ids,
                "effective_permission_ids": effective_ids,
            }
        )

    def put(self, request, user_id: int):
        target = User.objects.filter(id=user_id).first()
        if target is None:
            return Response({"detail": "Usuario no encontrado."}, status=404)

        deny = _assert_can_manage_user(request.user, target)
        if deny is not None:
            return deny

        permission_ids = request.data.get("permission_ids")
        if not isinstance(permission_ids, list) or not all(isinstance(x, int) for x in permission_ids):
            return Response({"detail": "permission_ids debe ser una lista de enteros."}, status=400)

        assignable = _get_assignable_permissions_for(request.user)
        perms = list(assignable.filter(id__in=permission_ids))
        if len(perms) != len(set(permission_ids)):
            return Response({"detail": "Incluiste permisos no permitidos o inexistentes."}, status=400)

        target.user_permissions.set(perms)
        return Response({"user_id": target.id, "permission_ids": [p.id for p in perms]})
