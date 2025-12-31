from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from .models import Teacher
from .serializers import TeacherSerializer
from core.permissions import KampusModelPermissions
from users.permissions import IsOwnerOrAdmin, IsAdmin


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all()
    serializer_class = TeacherSerializer
    permission_classes = [KampusModelPermissions]
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.action in ["list", "create", "destroy"]:
            return [IsAuthenticated(), IsAdmin()]
        if self.action in ["retrieve", "update", "partial_update"]:
            return [IsAuthenticated(), IsOwnerOrAdmin()]
        return super().get_permissions()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['year_id'] = self.request.query_params.get('year_id')
        return context
