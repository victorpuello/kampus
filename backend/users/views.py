from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import User
from .serializers import UserSerializer, UserCreateSerializer, UserAdminSerializer
from .permissions import IsAdmin, IsOwnerOrAdmin


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        
        if self.action in ["update", "partial_update"]:
            # If user is admin, allow role update via UserAdminSerializer
            if self.request.user.role in [User.ROLE_SUPERADMIN, User.ROLE_ADMIN]:
                return UserAdminSerializer

        return UserSerializer

    def get_permissions(self):
        if self.action in ["retrieve", "update", "partial_update", "me"]:
            # Allow users to see/edit themselves
            if self.action == "me":
                return [permissions.IsAuthenticated()]
            return [permissions.IsAuthenticated(), IsOwnerOrAdmin()]
        return super().get_permissions()

    @action(
        detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated]
    )
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)
