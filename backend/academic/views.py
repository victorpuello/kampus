from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    AcademicLevel,
    AcademicYear,
    Achievement,
    AchievementDefinition,
    Area,
    Assessment,
    Dimension,
    EvaluationComponent,
    EvaluationScale,
    Grade,
    Group,
    PerformanceIndicator,
    Period,
    StudentGrade,
    Subject,
    TeacherAssignment,
    AcademicLoad,
)
from .permissions import IsCoordinatorOrAdminOrReadOnly
from .serializers import (
    AcademicLevelSerializer,
    AcademicYearSerializer,
    AchievementDefinitionSerializer,
    AchievementSerializer,
    AreaSerializer,
    AssessmentSerializer,
    DimensionSerializer,
    EvaluationComponentSerializer,
    EvaluationScaleSerializer,
    GradeSerializer,
    GroupSerializer,
    PerformanceIndicatorSerializer,
    PeriodSerializer,
    StudentGradeSerializer,
    SubjectSerializer,
    TeacherAssignmentSerializer,
    AcademicLoadSerializer,
)
from .ai import AIService


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


class AcademicLoadViewSet(viewsets.ModelViewSet):
    queryset = AcademicLoad.objects.all()
    serializer_class = AcademicLoadSerializer
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


class AchievementDefinitionViewSet(viewsets.ModelViewSet):
    queryset = AchievementDefinition.objects.all()
    serializer_class = AchievementDefinitionSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]
    filterset_fields = ['area', 'subject', 'is_active', 'dimension']

    @action(detail=False, methods=['post'], url_path='improve-wording')
    def improve_wording(self, request):
        """
        Mejora la redacción de un texto usando IA.
        Body: { "text": "..." }
        """
        text = request.data.get('text')
        if not text:
            return Response({"error": "Text is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            ai_service = AIService()
            improved_text = ai_service.improve_text(text)
            return Response({"improved_text": improved_text})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AchievementViewSet(viewsets.ModelViewSet):
    queryset = Achievement.objects.all()
    serializer_class = AchievementSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]
    filterset_fields = ['subject', 'period']

    @action(detail=False, methods=['post'], url_path='generate-indicators')
    def generate_indicators(self, request):
        """
        Genera sugerencias de indicadores usando IA.
        Body: { "description": "..." }
        """
        description = request.data.get('description')
        if not description:
            return Response({"error": "Description is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            ai_service = AIService()
            indicators = ai_service.generate_indicators(description)
            return Response(indicators)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='create-indicators')
    def create_indicators(self, request, pk=None):
        """
        Crea indicadores masivamente para un logro existente.
        Body: { "indicators": [ {"level": "LOW", "description": "..."}, ... ] }
        """
        achievement = self.get_object()
        indicators_data = request.data.get('indicators', [])
        
        created_indicators = []
        errors = []
        
        for ind_data in indicators_data:
            serializer = PerformanceIndicatorSerializer(data={
                'achievement': achievement.id,
                'level': ind_data.get('level'),
                'description': ind_data.get('description')
            })
            if serializer.is_valid():
                serializer.save()
                created_indicators.append(serializer.data)
            else:
                errors.append(serializer.errors)
        
        if errors:
             return Response({"created": created_indicators, "errors": errors}, status=status.HTTP_207_MULTI_STATUS)

        return Response(created_indicators, status=status.HTTP_201_CREATED)


class PerformanceIndicatorViewSet(viewsets.ModelViewSet):
    queryset = PerformanceIndicator.objects.all()
    serializer_class = PerformanceIndicatorSerializer


class DimensionViewSet(viewsets.ModelViewSet):
    queryset = Dimension.objects.all()
    serializer_class = DimensionSerializer
    permission_classes = [IsCoordinatorOrAdminOrReadOnly]
    filterset_fields = ["academic_year", "is_active"]

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
