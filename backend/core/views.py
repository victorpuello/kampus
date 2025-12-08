from rest_framework import viewsets
from .models import Institution, Campus
from .serializers import InstitutionSerializer, CampusSerializer
from .permissions import IsAdminOrReadOnly

class InstitutionViewSet(viewsets.ModelViewSet):
    queryset = Institution.objects.all()
    serializer_class = InstitutionSerializer
    permission_classes = [IsAdminOrReadOnly]

class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [IsAdminOrReadOnly]
