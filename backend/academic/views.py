from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    AcademicLevel,
    AcademicYear,
    Achievement,
    Area,
    Assessment,
    EvaluationComponent,
    EvaluationScale,
    Grade,
    Group,
    Period,
    StudentGrade,
    Subject,
    TeacherAssignment,
)
from .permissions import IsCoordinatorOrAdminOrReadOnly
from .serializers import (
    AcademicLevelSerializer,
    AcademicYearSerializer,
    AchievementSerializer,
    AreaSerializer,
    AssessmentSerializer,
    EvaluationComponentSerializer,
    EvaluationScaleSerializer,
    GradeSerializer,
    GroupSerializer,
    PeriodSerializer,
    StudentGradeSerializer,
    SubjectSerializer,
    TeacherAssignmentSerializer,
)


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class PeriodViewSet(viewsets.ModelViewSet):
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class AcademicLevelViewSet(viewsets.ModelViewSet):
    queryset = AcademicLevel.objects.all()
    serializer_class = AcademicLevelSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class AreaViewSet(viewsets.ModelViewSet):
    queryset = Area.objects.all()
    serializer_class = AreaSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class TeacherAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class EvaluationScaleViewSet(viewsets.ModelViewSet):
    queryset = EvaluationScale.objects.all()
    serializer_class = EvaluationScaleSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]

    @action(detail=False, methods=['post'])
    def copy_from_year(self, request):
        source_year_id = request.data.get('source_year_id')
        target_year_id = request.data.get('target_year_id')
        
        if not source_year_id or not target_year_id:
            return Response(
                {"error": "source_year_id and target_year_id are required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        source_scales = EvaluationScale.objects.filter(academic_year_id=source_year_id)
        
        if not source_scales.exists():
            return Response(
                {"error": "No scales found in source year"}, 
                status=status.HTTP_404_NOT_FOUND
            )
            
        created_count = 0
        for scale in source_scales:
            # Check if similar scale exists in target year to avoid duplicates
            if not EvaluationScale.objects.filter(
                academic_year_id=target_year_id, 
                name=scale.name
            ).exists():
                EvaluationScale.objects.create(
                    academic_year_id=target_year_id,
                    name=scale.name,
                    min_score=scale.min_score,
                    max_score=scale.max_score,
                    description=scale.description,
                    scale_type=scale.scale_type
                )
                created_count += 1
                
        return Response({"message": f"Se copiaron {created_count} escalas correctamente"})


class EvaluationComponentViewSet(viewsets.ModelViewSet):
    queryset = EvaluationComponent.objects.all()
    serializer_class = EvaluationComponentSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.all()
    serializer_class = AssessmentSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class StudentGradeViewSet(viewsets.ModelViewSet):
    queryset = StudentGrade.objects.all()
    serializer_class = StudentGradeSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]


class AchievementViewSet(viewsets.ModelViewSet):
    queryset = Achievement.objects.all()
    serializer_class = AchievementSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]
