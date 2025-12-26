from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Q

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
    GradeSheet,
    AchievementGrade,
)
from core.permissions import KampusModelPermissions
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
    GradeSheetSerializer,
    GradebookBulkUpsertSerializer,
)
from .ai import AIService
from .grading import (
    DEFAULT_EMPTY_SCORE,
    final_grade_from_dimensions,
    match_scale,
    weighted_average,
)


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [KampusModelPermissions]


class PeriodViewSet(viewsets.ModelViewSet):
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = [KampusModelPermissions]
    filterset_fields = ['academic_year']


class AcademicLevelViewSet(viewsets.ModelViewSet):
    queryset = AcademicLevel.objects.all()
    serializer_class = AcademicLevelSerializer
    permission_classes = [KampusModelPermissions]


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [KampusModelPermissions]


class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    permission_classes = [KampusModelPermissions]
    filterset_fields = ['grade', 'academic_year', 'director']


class AreaViewSet(viewsets.ModelViewSet):
    queryset = Area.objects.all()
    serializer_class = AreaSerializer
    permission_classes = [KampusModelPermissions]


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [KampusModelPermissions]


class AcademicLoadViewSet(viewsets.ModelViewSet):
    queryset = AcademicLoad.objects.all()
    serializer_class = AcademicLoadSerializer
    permission_classes = [KampusModelPermissions]


class TeacherAssignmentViewSet(viewsets.ModelViewSet):
    queryset = TeacherAssignment.objects.all()
    serializer_class = TeacherAssignmentSerializer
    permission_classes = [KampusModelPermissions]

    def _deny_write_if_teacher(self, request):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            return Response({"detail": "No tienes permisos para modificar asignaciones."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def create(self, request, *args, **kwargs):
        denied = self._deny_write_if_teacher(request)
        if denied is not None:
            return denied
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        denied = self._deny_write_if_teacher(request)
        if denied is not None:
            return denied
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        denied = self._deny_write_if_teacher(request)
        if denied is not None:
            return denied
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._deny_write_if_teacher(request)
        if denied is not None:
            return denied
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.select_related(
            "teacher",
            "academic_year",
            "group__grade",
            "academic_load__subject",
            "academic_load__grade",
        )

    @action(detail=False, methods=["get"], url_path="me", permission_classes=[IsAuthenticated])
    def me(self, request):
        """Return only the authenticated teacher's assignments."""
        user = getattr(request, "user", None)
        if user is None or getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

        qs = (
            self.get_queryset()
            .filter(teacher=user)
            .order_by("-academic_year__year", "group__grade__name", "group__name")
        )

        academic_year = request.query_params.get("academic_year")
        if academic_year:
            qs = qs.filter(academic_year_id=academic_year)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class EvaluationScaleViewSet(viewsets.ModelViewSet):
    queryset = EvaluationScale.objects.all()
    serializer_class = EvaluationScaleSerializer
    permission_classes = [KampusModelPermissions]

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
    permission_classes = [KampusModelPermissions]


class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.all()
    serializer_class = AssessmentSerializer
    permission_classes = [KampusModelPermissions]


class StudentGradeViewSet(viewsets.ModelViewSet):
    queryset = StudentGrade.objects.all()
    serializer_class = StudentGradeSerializer
    permission_classes = [KampusModelPermissions]


class AchievementDefinitionViewSet(viewsets.ModelViewSet):
    queryset = AchievementDefinition.objects.all()
    serializer_class = AchievementDefinitionSerializer
    permission_classes = [KampusModelPermissions]
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
    permission_classes = [KampusModelPermissions]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['subject', 'period', 'group']

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
    permission_classes = [KampusModelPermissions]


class DimensionViewSet(viewsets.ModelViewSet):
    queryset = Dimension.objects.all()
    serializer_class = DimensionSerializer
    permission_classes = [KampusModelPermissions]
    filterset_fields = ["academic_year", "is_active"]

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GradeSheetViewSet(viewsets.ModelViewSet):
    queryset = GradeSheet.objects.all()
    serializer_class = GradeSheetSerializer
    permission_classes = [KampusModelPermissions]

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if getattr(user, "role", None) == "TEACHER":
            return qs.filter(teacher_assignment__teacher=user)
        return qs

    def _get_teacher_assignment(self, teacher_assignment_id: int):
        qs = TeacherAssignment.objects.all()
        if getattr(self.request.user, "role", None) == "TEACHER":
            qs = qs.filter(teacher=self.request.user)
        return qs.select_related("academic_year", "group", "academic_load").get(id=teacher_assignment_id)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        period_id = request.query_params.get("period")
        if not period_id:
            return Response({"error": "period es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            period = Period.objects.select_related("academic_year").get(id=int(period_id))
        except Period.DoesNotExist:
            return Response({"error": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        tas = TeacherAssignment.objects.filter(academic_year_id=period.academic_year_id)
        if getattr(request.user, "role", None) == "TEACHER":
            tas = tas.filter(teacher=request.user)

        tas = tas.select_related(
            "group",
            "group__grade",
            "academic_load",
            "academic_load__subject",
        ).order_by("group__grade__name", "group__name", "academic_load__subject__name")

        from students.models import Enrollment

        items = []
        for ta in tas:
            enrollments_qs = Enrollment.objects.filter(
                academic_year_id=ta.academic_year_id,
                group_id=ta.group_id,
                status="ACTIVE",
            )
            students_count = enrollments_qs.count()

            base_achievements = Achievement.objects.filter(
                academic_load_id=ta.academic_load_id,
                period_id=period.id,
            )
            group_achievements = base_achievements.filter(group_id=ta.group_id)
            if group_achievements.exists():
                achievements_qs = group_achievements
            else:
                achievements_qs = base_achievements.filter(group__isnull=True)

            achievement_ids = list(achievements_qs.values_list("id", flat=True))
            achievements_count = len(achievement_ids)

            total = students_count * achievements_count

            gradesheet_id = (
                GradeSheet.objects.filter(teacher_assignment_id=ta.id, period_id=period.id)
                .values_list("id", flat=True)
                .first()
            )

            filled = 0
            if gradesheet_id and total > 0 and achievement_ids:
                filled = (
                    AchievementGrade.objects.filter(
                        gradesheet_id=gradesheet_id,
                        enrollment__in=enrollments_qs,
                        achievement_id__in=achievement_ids,
                        score__isnull=False,
                    )
                    .only("id")
                    .count()
                )

            percent = int(round((filled / total) * 100)) if total > 0 else 0
            is_complete = total > 0 and filled >= total

            items.append(
                {
                    "teacher_assignment_id": ta.id,
                    "group_id": ta.group_id,
                    "group_name": ta.group.name,
                    "grade_id": ta.group.grade_id,
                    "grade_name": ta.group.grade.name,
                    "academic_load_id": ta.academic_load_id,
                    "subject_name": ta.academic_load.subject.name if ta.academic_load_id else None,
                    "period": {"id": period.id, "name": period.name, "is_closed": period.is_closed},
                    "students_count": students_count,
                    "achievements_count": achievements_count,
                    "completion": {
                        "filled": filled,
                        "total": total,
                        "percent": percent,
                        "is_complete": is_complete,
                    },
                }
            )

        return Response({"results": items})

    @action(detail=False, methods=["get"], url_path="gradebook")
    def gradebook(self, request):
        teacher_assignment_id = request.query_params.get("teacher_assignment")
        period_id = request.query_params.get("period")
        if not teacher_assignment_id or not period_id:
            return Response(
                {"error": "teacher_assignment y period son requeridos"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher_assignment = self._get_teacher_assignment(int(teacher_assignment_id))
        except TeacherAssignment.DoesNotExist:
            return Response({"error": "TeacherAssignment no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        try:
            period = Period.objects.select_related("academic_year").get(id=int(period_id))
        except Period.DoesNotExist:
            return Response({"error": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if period.academic_year_id != teacher_assignment.academic_year_id:
            return Response(
                {"error": "El periodo no corresponde al año lectivo de la asignación"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        gradesheet, _ = GradeSheet.objects.get_or_create(
            teacher_assignment=teacher_assignment,
            period=period,
        )

        base_achievements = Achievement.objects.filter(
            academic_load=teacher_assignment.academic_load,
            period=period,
        )

        group_achievements = base_achievements.filter(group=teacher_assignment.group)
        if group_achievements.exists():
            achievements = group_achievements
        else:
            achievements = base_achievements.filter(group__isnull=True)

        achievements = achievements.select_related("dimension").order_by("id")

        from students.models import Enrollment

        enrollments = (
            Enrollment.objects.filter(
                academic_year_id=teacher_assignment.academic_year_id,
                group_id=teacher_assignment.group_id,
                status="ACTIVE",
            )
            .select_related("student__user")
            .order_by("student__user__last_name", "student__user__first_name")
        )

        existing_grades = AchievementGrade.objects.filter(
            gradesheet=gradesheet,
            enrollment__in=enrollments,
            achievement__in=achievements,
        ).only("enrollment_id", "achievement_id", "score")

        score_by_cell = {
            (g.enrollment_id, g.achievement_id): g.score for g in existing_grades
        }

        achievement_payload = [
            {
                "id": a.id,
                "description": a.description,
                "dimension": a.dimension_id,
                "dimension_name": a.dimension.name if a.dimension else None,
                "percentage": a.percentage,
            }
            for a in achievements
        ]

        student_payload = [
            {
                "enrollment_id": e.id,
                "student_id": e.student_id,
                "student_name": e.student.user.get_full_name(),
            }
            for e in enrollments
        ]

        cell_payload = [
            {
                "enrollment": e.id,
                "achievement": a.id,
                "score": score_by_cell.get((e.id, a.id)),
            }
            for e in enrollments
            for a in achievements
        ]

        # Compute per-student final grade using dimensions + NULL=>1.00
        achievements_by_dimension: dict[int, list[Achievement]] = {}
        for a in achievements:
            if not a.dimension_id:
                continue
            achievements_by_dimension.setdefault(a.dimension_id, []).append(a)

        dimensions = (
            Dimension.objects.filter(
                academic_year_id=teacher_assignment.academic_year_id,
                id__in=list(achievements_by_dimension.keys()),
            )
            .only("id", "name", "percentage")
            .order_by("id")
        )
        dim_percentage_by_id = {d.id: int(d.percentage) for d in dimensions}

        dimensions_payload = [
            {"id": d.id, "name": d.name, "percentage": int(d.percentage)} for d in dimensions
        ]

        computed = []
        for e in enrollments:
            dim_items = []
            for dim_id, dim_achievements in achievements_by_dimension.items():
                items = [
                    (score_by_cell.get((e.id, a.id)), int(a.percentage) if a.percentage else 1)
                    for a in dim_achievements
                ]
                dim_grade = weighted_average(items) if items else DEFAULT_EMPTY_SCORE
                dim_items.append((dim_grade, dim_percentage_by_id.get(dim_id, 0)))

            final_score = final_grade_from_dimensions(dim_items)
            scale_match = match_scale(teacher_assignment.academic_year_id, final_score)
            computed.append(
                {
                    "enrollment_id": e.id,
                    "final_score": final_score,
                    "scale": scale_match.name if scale_match else None,
                }
            )

        return Response(
            {
                "gradesheet": GradeSheetSerializer(gradesheet).data,
                "period": {"id": period.id, "name": period.name, "is_closed": period.is_closed},
                "teacher_assignment": {
                    "id": teacher_assignment.id,
                    "group": teacher_assignment.group_id,
                    "academic_load": teacher_assignment.academic_load_id,
                },
                "dimensions": dimensions_payload,
                "achievements": achievement_payload,
                "students": student_payload,
                "cells": cell_payload,
                "computed": computed,
            }
        )

    @action(detail=False, methods=["post"], url_path="bulk-upsert")
    def bulk_upsert(self, request):
        serializer = GradebookBulkUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        teacher_assignment_id = serializer.validated_data["teacher_assignment"]
        period_id = serializer.validated_data["period"]
        grades = serializer.validated_data["grades"]

        try:
            teacher_assignment = self._get_teacher_assignment(int(teacher_assignment_id))
        except TeacherAssignment.DoesNotExist:
            return Response({"error": "TeacherAssignment no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        try:
            period = Period.objects.select_related("academic_year").get(id=int(period_id))
        except Period.DoesNotExist:
            return Response({"error": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if period.is_closed:
            return Response(
                {"error": "El periodo está cerrado; no se pueden registrar notas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if period.academic_year_id != teacher_assignment.academic_year_id:
            return Response(
                {"error": "El periodo no corresponde al año lectivo de la asignación"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        gradesheet, _ = GradeSheet.objects.get_or_create(
            teacher_assignment=teacher_assignment,
            period=period,
        )

        from students.models import Enrollment

        valid_enrollments = set(
            Enrollment.objects.filter(
                academic_year_id=teacher_assignment.academic_year_id,
                group_id=teacher_assignment.group_id,
            ).values_list("id", flat=True)
        )

        base_achievements = Achievement.objects.filter(
            academic_load=teacher_assignment.academic_load,
            period=period,
        )
        group_achievements = base_achievements.filter(group=teacher_assignment.group)
        if group_achievements.exists():
            valid_achievements = set(group_achievements.values_list("id", flat=True))
        else:
            valid_achievements = set(
                base_achievements.filter(group__isnull=True).values_list("id", flat=True)
            )

        to_upsert = []
        for g in grades:
            enrollment_id = g["enrollment"]
            achievement_id = g["achievement"]
            if enrollment_id not in valid_enrollments:
                return Response(
                    {"error": f"Enrollment inválido: {enrollment_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if achievement_id not in valid_achievements:
                return Response(
                    {"error": f"Achievement inválido: {achievement_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            to_upsert.append(
                AchievementGrade(
                    gradesheet=gradesheet,
                    enrollment_id=enrollment_id,
                    achievement_id=achievement_id,
                    score=g.get("score"),
                )
            )

        with transaction.atomic():
            AchievementGrade.objects.bulk_create(
                to_upsert,
                update_conflicts=True,
                unique_fields=["gradesheet", "enrollment", "achievement"],
                update_fields=["score", "updated_at"],
            )

        # Return recomputed final scores for impacted enrollments (for live UI updates)
        impacted_enrollment_ids = sorted({g["enrollment"] for g in grades})

        base_achievements = Achievement.objects.filter(
            academic_load=teacher_assignment.academic_load,
            period=period,
        )

        group_achievements = base_achievements.filter(group=teacher_assignment.group)
        if group_achievements.exists():
            achievements = group_achievements
        else:
            achievements = base_achievements.filter(group__isnull=True)

        achievements = achievements.select_related("dimension").order_by("id")

        achievements_by_dimension: dict[int, list[Achievement]] = {}
        for a in achievements:
            if not a.dimension_id:
                continue
            achievements_by_dimension.setdefault(a.dimension_id, []).append(a)

        dimensions = Dimension.objects.filter(
            academic_year_id=teacher_assignment.academic_year_id,
            id__in=list(achievements_by_dimension.keys()),
        ).only("id", "percentage")
        dim_percentage_by_id = {d.id: int(d.percentage) for d in dimensions}

        existing_grades = AchievementGrade.objects.filter(
            gradesheet=gradesheet,
            enrollment_id__in=impacted_enrollment_ids,
            achievement__in=achievements,
        ).only("enrollment_id", "achievement_id", "score")

        score_by_cell = {(g.enrollment_id, g.achievement_id): g.score for g in existing_grades}

        computed = []
        for enrollment_id in impacted_enrollment_ids:
            dim_items = []
            for dim_id, dim_achievements in achievements_by_dimension.items():
                items = [
                    (
                        score_by_cell.get((enrollment_id, a.id)),
                        int(a.percentage) if a.percentage else 1,
                    )
                    for a in dim_achievements
                ]
                dim_grade = weighted_average(items) if items else DEFAULT_EMPTY_SCORE
                dim_items.append((dim_grade, dim_percentage_by_id.get(dim_id, 0)))

            final_score = final_grade_from_dimensions(dim_items)
            scale_match = match_scale(teacher_assignment.academic_year_id, final_score)
            computed.append(
                {
                    "enrollment_id": enrollment_id,
                    "final_score": final_score,
                    "scale": scale_match.name if scale_match else None,
                }
            )

        return Response(
            {"updated": len(to_upsert), "computed": computed},
            status=status.HTTP_200_OK,
        )
