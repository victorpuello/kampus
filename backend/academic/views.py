from rest_framework import viewsets
from .models import AcademicYear, Grade
from .serializers import AcademicYearSerializer, GradeSerializer
from .permissions import IsCoordinatorOrAdminOrReadOnly


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]
