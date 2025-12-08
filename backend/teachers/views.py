from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Teacher
from .serializers import TeacherSerializer, TeacherCreateSerializer, TeacherUpdateSerializer
from users.permissions import IsAdmin, IsOwnerOrAdmin


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all()
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_serializer_class(self):
        if self.action == "create":
            return TeacherCreateSerializer
        if self.action in ["update", "partial_update"]:
            return TeacherUpdateSerializer
        return TeacherSerializer

    def get_permissions(self):
        if self.action in ["retrieve", "update", "partial_update"]:
            return [IsAuthenticated(), IsOwnerOrAdmin()]
        return super().get_permissions()
