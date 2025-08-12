from rest_framework import viewsets
from .models import Student, FamilyMember, Enrollment
from .serializers import (
    StudentSerializer,
    FamilyMemberSerializer,
    EnrollmentSerializer,
)
from .permissions import IsSecretaryOrAdminOrReadOnly


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related("user").all().order_by("user__id")
    serializer_class = StudentSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]


class FamilyMemberViewSet(viewsets.ModelViewSet):
    queryset = FamilyMember.objects.select_related("student").all().order_by("id")
    serializer_class = FamilyMemberSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.select_related("student").all().order_by("id")
    serializer_class = EnrollmentSerializer
    permission_classes = [IsSecretaryOrAdminOrReadOnly]
