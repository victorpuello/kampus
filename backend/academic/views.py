from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from datetime import datetime, time
from decimal import Decimal


def _period_end_of_day(period: "Period"):
    """Fallback deadline when explicit edit_until is not configured.

    Uses the period end_date at 23:59:59 in the current timezone.
    """

    if getattr(period, "end_date", None) is None:
        return None
    tz = timezone.get_current_timezone()
    dt = datetime.combine(period.end_date, time(23, 59, 59))
    return timezone.make_aware(dt, tz)

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
    EditRequest,
    EditRequestItem,
    EditGrant,
    EditGrantItem,
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
    EditRequestSerializer,
    EditRequestDecisionSerializer,
    EditGrantSerializer,
)
from .ai import AIService
from .grading import (
    DEFAULT_EMPTY_SCORE,
    final_grade_from_dimensions,
    match_scale,
    weighted_average,
)
from .promotion import compute_promotions_for_year, PASSING_SCORE_DEFAULT


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    permission_classes = [KampusModelPermissions]

    @action(detail=True, methods=["get"], url_path="promotion-preview")
    def promotion_preview(self, request, pk=None):
        year: AcademicYear = self.get_object()

        passing_score_raw = request.query_params.get("passing_score")
        try:
            passing_score = PASSING_SCORE_DEFAULT if not passing_score_raw else Decimal(str(passing_score_raw))
        except Exception:
            return Response({"detail": "passing_score inválido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            computed = compute_promotions_for_year(academic_year=year, passing_score=passing_score)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        results = []
        for enrollment_id, c in computed.items():
            results.append(
                {
                    "enrollment_id": enrollment_id,
                    "decision": c.decision,
                    "failed_subjects_count": len(c.failed_subject_ids),
                    "failed_areas_count": len(c.failed_area_ids),
                    "failed_subjects_distinct_areas_count": c.failed_subjects_distinct_areas_count,
                    "failed_subject_ids": c.failed_subject_ids,
                    "failed_area_ids": c.failed_area_ids,
                }
            )

        results.sort(key=lambda x: (x["decision"], x["enrollment_id"]))
        return Response(
            {
                "academic_year": {"id": year.id, "year": year.year, "status": year.status},
                "passing_score": str(passing_score),
                "count": len(results),
                "results": results,
            }
        )

    @action(detail=True, methods=["post"], url_path="close-with-promotion")
    def close_with_promotion(self, request, pk=None):
        from decimal import Decimal

        from students.models import Enrollment
        from .models import EnrollmentPromotionSnapshot, Period

        year: AcademicYear = self.get_object()

        # Require all periods closed before closing academic year.
        if Period.objects.filter(academic_year=year, is_closed=False).exists():
            return Response(
                {"detail": "No se puede cerrar el año: hay periodos abiertos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        passing_score_raw = request.data.get("passing_score")
        try:
            passing_score = PASSING_SCORE_DEFAULT if passing_score_raw in (None, "") else Decimal(str(passing_score_raw))
        except Exception:
            return Response({"detail": "passing_score inválido"}, status=status.HTTP_400_BAD_REQUEST)

        computed = compute_promotions_for_year(academic_year=year, passing_score=passing_score)

        with transaction.atomic():
            # Persist decisions: store a human-readable string in Enrollment.final_status (legacy field)
            enrollments = Enrollment.objects.filter(id__in=list(computed.keys())).select_related("grade")

            updated = 0
            created = 0

            for e in enrollments:
                c = computed.get(e.id)
                if not c:
                    continue

                # Map decisions to legacy final_status text
                if c.decision == "PROMOTED":
                    final_status = "PROMOCIÓN PLENA"
                elif c.decision == "CONDITIONAL":
                    final_status = "PROMOCIÓN CONDICIONAL"
                elif c.decision == "REPEATED":
                    final_status = "REPROBÓ / REPITE"
                else:
                    final_status = c.decision

                # Grade 11 (último) => Graduado when promoted and no pending
                is_grade_11 = False
                if getattr(e.grade, "ordinal", None) is not None:
                    is_grade_11 = int(e.grade.ordinal) >= 13
                else:
                    is_grade_11 = str(e.grade.name).strip().lower() in {"11", "11°", "once", "undecimo", "undécimo"}

                if is_grade_11 and c.decision == "PROMOTED":
                    final_status = "GRADUADO"
                    e.status = "GRADUATED"

                e.final_status = final_status
                e.save(update_fields=["final_status", "status"] if e.status == "GRADUATED" else ["final_status"])

                details = {
                    "passing_score": str(passing_score),
                    "subject_finals": {str(k): str(v) for k, v in c.subject_finals.items()},
                    "failed_subject_ids": c.failed_subject_ids,
                    "failed_area_ids": c.failed_area_ids,
                }

                snap_values = {
                    "decision": "GRADUATED" if final_status == "GRADUADO" else c.decision,
                    "failed_subjects_count": len(c.failed_subject_ids),
                    "failed_areas_count": len(c.failed_area_ids),
                    "failed_subjects_distinct_areas_count": c.failed_subjects_distinct_areas_count,
                    "details": details,
                }

                snap, was_created = EnrollmentPromotionSnapshot.objects.update_or_create(
                    enrollment=e,
                    defaults=snap_values,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

            # Close the year
            year.status = AcademicYear.STATUS_CLOSED
            year.save(update_fields=["status"])

        return Response(
            {
                "academic_year": {"id": year.id, "year": year.year, "status": year.status},
                "passing_score": str(passing_score),
                "snapshots": {"created": created, "updated": updated},
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="apply-promotions")
    def apply_promotions(self, request, pk=None):
        """Creates next-year enrollments based on promotion snapshots.

        Body: {"target_academic_year": <id>}
        """

        from students.models import ConditionalPromotionPlan, Enrollment
        from .models import EnrollmentPromotionSnapshot

        source_year: AcademicYear = self.get_object()
        target_year_id = request.data.get("target_academic_year")
        if not target_year_id:
            return Response({"detail": "target_academic_year es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_year = AcademicYear.objects.get(id=int(target_year_id))
        except Exception:
            return Response({"detail": "target_academic_year inválido"}, status=status.HTTP_400_BAD_REQUEST)

        if source_year.id == target_year.id:
            return Response({"detail": "El año destino debe ser diferente"}, status=status.HTTP_400_BAD_REQUEST)

        if source_year.status != AcademicYear.STATUS_CLOSED:
            return Response(
                {"detail": "El año origen debe estar FINALIZADO (CLOSED) para aplicar promociones."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine the first period of the target year for PAP deadlines (optional)
        first_period = (
            Period.objects.filter(academic_year=target_year).order_by("start_date").only("id").first()
        )

        # Grade progression mapping using ordinal
        grades = list(Grade.objects.exclude(ordinal__isnull=True).only("id", "ordinal"))
        ordinal_to_grade_id = {int(g.ordinal): int(g.id) for g in grades}

        def next_grade_id(current_grade: Grade) -> int | None:
            ord_val = getattr(current_grade, "ordinal", None)
            if ord_val is None:
                return None
            return ordinal_to_grade_id.get(int(ord_val) + 1)

        source_enrollments = (
            Enrollment.objects.filter(academic_year=source_year)
            .select_related("student", "grade", "grade__level")
            .order_by("id")
        )

        snapshots = {
            s.enrollment_id: s
            for s in EnrollmentPromotionSnapshot.objects.filter(enrollment__in=source_enrollments)
        }

        created = 0
        skipped_existing = 0
        skipped_graduated = 0
        skipped_missing_grade_ordinal = 0

        with transaction.atomic():
            for e in source_enrollments:
                snap = snapshots.get(e.id)
                if not snap:
                    # Only apply promotions for enrollments with snapshots.
                    continue

                # Skip already graduated students
                if e.status == "GRADUATED" or snap.decision == "GRADUATED":
                    skipped_graduated += 1
                    continue

                # Decide target grade
                if snap.decision in {"PROMOTED", "CONDITIONAL"}:
                    ngid = next_grade_id(e.grade)
                    if ngid is None:
                        skipped_missing_grade_ordinal += 1
                        continue
                    target_grade_id = ngid
                else:
                    # REPEATED => stays in same grade
                    target_grade_id = e.grade_id

                # Ensure uniqueness (student, academic_year)
                if Enrollment.objects.filter(student=e.student, academic_year=target_year).exists():
                    skipped_existing += 1
                    continue

                new_enrollment = Enrollment.objects.create(
                    student=e.student,
                    academic_year=target_year,
                    grade_id=target_grade_id,
                    group=None,
                    campus=e.campus,
                    status="ACTIVE",
                    origin_school=e.origin_school,
                    final_status="",
                    enrolled_at=None,
                )
                created += 1

                # Create conditional promotion plan (PAP placeholder)
                if snap.decision == "CONDITIONAL":
                    details = snap.details or {}
                    ConditionalPromotionPlan.objects.create(
                        enrollment=new_enrollment,
                        source_enrollment=e,
                        due_period=first_period,
                        pending_subject_ids=list(details.get("failed_subject_ids", [])),
                        pending_area_ids=list(details.get("failed_area_ids", [])),
                        status=ConditionalPromotionPlan.STATUS_OPEN,
                        notes="Generado automáticamente por promoción condicional (SIEE).",
                    )

        return Response(
            {
                "source_academic_year": {"id": source_year.id, "year": source_year.year},
                "target_academic_year": {"id": target_year.id, "year": target_year.year},
                "created": created,
                "skipped_existing": skipped_existing,
                "skipped_graduated": skipped_graduated,
                "skipped_missing_grade_ordinal": skipped_missing_grade_ordinal,
            },
            status=status.HTTP_200_OK,
        )


class PeriodViewSet(viewsets.ModelViewSet):
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = [KampusModelPermissions]
    filterset_fields = ['academic_year']

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        period: Period = self.get_object()

        if period.is_closed:
            return Response(
                {"period": {"id": period.id, "name": period.name, "is_closed": True}},
                status=status.HTTP_200_OK,
            )

        academic_year = getattr(period, "academic_year", None)
        if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
            return Response(
                {"detail": "No se pueden cerrar periodos de un año lectivo finalizado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Block closure if there are OPEN PAP plans due on this period.
        from students.models import ConditionalPromotionPlan

        pending_qs = ConditionalPromotionPlan.objects.filter(due_period=period, status=ConditionalPromotionPlan.STATUS_OPEN)
        pending_count = pending_qs.count()
        if pending_count > 0:
            enrollment_ids = list(pending_qs.values_list("enrollment_id", flat=True)[:50])
            return Response(
                {
                    "detail": "No se puede cerrar el periodo: hay PAP pendientes.",
                    "pending_pap_count": pending_count,
                    "pending_enrollment_ids_sample": enrollment_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        period.is_closed = True
        period.save(update_fields=["is_closed"])
        return Response({"period": {"id": period.id, "name": period.name, "is_closed": True}}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        period: Period = self.get_object()
        academic_year = getattr(period, "academic_year", None)
        if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
            return Response(
                {"detail": "No se pueden reabrir periodos de un año lectivo finalizado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period.is_closed = False
        period.save(update_fields=["is_closed"])
        return Response({"period": {"id": period.id, "name": period.name, "is_closed": False}}, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        academic_year = getattr(instance, "academic_year", None)
        if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
            return Response(
                {"detail": "No se pueden eliminar periodos de un año lectivo finalizado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


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

    @action(detail=False, methods=['post'], url_path='copy_from_year')
    def copy_from_year(self, request):
        source_year_id = request.data.get('source_year_id')
        target_year_id = request.data.get('target_year_id')

        if not source_year_id or not target_year_id:
            return Response(
                {"error": "source_year_id and target_year_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            source_year_id = int(source_year_id)
            target_year_id = int(target_year_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "source_year_id and target_year_id must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source_year_id == target_year_id:
            return Response(
                {"error": "source_year_id and target_year_id must be different"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_groups = Group.objects.filter(academic_year_id=source_year_id)
        if not source_groups.exists():
            return Response(
                {"error": "No groups found in source year"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if Group.objects.filter(academic_year_id=target_year_id).exists():
            return Response(
                {
                    "error": "El año destino ya tiene grupos configurados. Elimina o ajusta antes de importar."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_count = 0
        with transaction.atomic():
            for group in source_groups:
                Group.objects.create(
                    academic_year_id=target_year_id,
                    name=group.name,
                    grade_id=group.grade_id,
                    campus_id=group.campus_id,
                    director_id=group.director_id,
                    shift=group.shift,
                    classroom=group.classroom,
                    capacity=group.capacity,
                )
                created_count += 1

        return Response({"message": f"Se copiaron {created_count} grupos correctamente"})


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

    def get_permissions(self):
        # Creating/editing definitions is a teacher workflow in the UI, but teachers may not
        # have Django model add/change permissions assigned. We gate it by role instead.
        if getattr(self, "action", None) in {"create", "update", "partial_update", "destroy"}:
            return [IsAuthenticated()]
        return super().get_permissions()

    def _ensure_can_manage_definitions(self, request):
        role = getattr(getattr(request, 'user', None), 'role', None)
        if role in {'TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN'}:
            return None
        return Response({"detail": "No tienes permisos para gestionar el banco de logros."}, status=status.HTTP_403_FORBIDDEN)

    def create(self, request, *args, **kwargs):
        denied = self._ensure_can_manage_definitions(request)
        if denied is not None:
            return denied
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        denied = self._ensure_can_manage_definitions(request)
        if denied is not None:
            return denied
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._ensure_can_manage_definitions(request)
        if denied is not None:
            return denied
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='improve-wording', permission_classes=[IsAuthenticated])
    def improve_wording(self, request):
        """
        Mejora la redacción de un texto usando IA.
        Body: { "text": "..." }
        """
        role = getattr(getattr(request, 'user', None), 'role', None)
        if role not in {'TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN'}:
            return Response({"detail": "No tienes permisos para usar esta función."}, status=status.HTTP_403_FORBIDDEN)

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

    def _teacher_can_edit_planning(self, user, period: Period) -> bool:
        effective_deadline = period.planning_edit_until or _period_end_of_day(period)
        if effective_deadline is None:
            return True
        if timezone.now() <= effective_deadline:
            return True
        return EditGrant.objects.filter(
            granted_to=user,
            scope=EditRequest.SCOPE_PLANNING,
            period_id=period.id,
            valid_until__gte=timezone.now(),
        ).exists()

    def _get_period_for_create(self, request):
        period_id = request.data.get("period")
        if not period_id:
            return None
        return Period.objects.filter(id=period_id).first()

    def create(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            period = self._get_period_for_create(request)
            if period is not None and not self._teacher_can_edit_planning(user, period):
                return Response(
                    {"detail": "La edición de planeación está cerrada para este periodo.", "code": "EDIT_WINDOW_CLOSED"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            instance = self.get_object()
            period = getattr(instance, "period", None)
            if period is not None and not self._teacher_can_edit_planning(user, period):
                return Response(
                    {"detail": "La edición de planeación está cerrada para este periodo.", "code": "EDIT_WINDOW_CLOSED"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            instance = self.get_object()
            period = getattr(instance, "period", None)
            if period is not None and not self._teacher_can_edit_planning(user, period):
                return Response(
                    {"detail": "La edición de planeación está cerrada para este periodo.", "code": "EDIT_WINDOW_CLOSED"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().destroy(request, *args, **kwargs)

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

    @action(detail=False, methods=['post'], url_path='copy_from_year')
    def copy_from_year(self, request):
        source_year_id = request.data.get('source_year_id')
        target_year_id = request.data.get('target_year_id')

        if not source_year_id or not target_year_id:
            return Response(
                {"error": "source_year_id and target_year_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            source_year_id = int(source_year_id)
            target_year_id = int(target_year_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "source_year_id and target_year_id must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source_year_id == target_year_id:
            return Response(
                {"error": "source_year_id and target_year_id must be different"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_dims = Dimension.objects.filter(academic_year_id=source_year_id)
        if not source_dims.exists():
            return Response(
                {"error": "No dimensions found in source year"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if Dimension.objects.filter(academic_year_id=target_year_id).exists():
            return Response(
                {
                    "error": "El año destino ya tiene dimensiones configuradas. Elimina o ajusta antes de copiar."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_count = 0
        with transaction.atomic():
            for dim in source_dims:
                Dimension.objects.create(
                    academic_year_id=target_year_id,
                    name=dim.name,
                    description=dim.description,
                    percentage=dim.percentage,
                    is_active=dim.is_active,
                )
                created_count += 1

        return Response({"message": f"Se copiaron {created_count} dimensiones correctamente"})

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

        user = getattr(request, "user", None)
        is_teacher = user is not None and getattr(user, "role", None) == "TEACHER"

        # Teacher edit window enforcement (admins/coordinators are not restricted by deadline)
        allowed_enrollment_ids: set[int] | None = None
        # Only enforce deadline when explicitly configured (avoid time-dependent behavior in tests
        # and keep legacy behavior where open periods allow edits).
        effective_deadline = period.grades_edit_until
        if is_teacher and effective_deadline is not None and timezone.now() > effective_deadline:
            active_grants = EditGrant.objects.filter(
                granted_to=user,
                scope=EditRequest.SCOPE_GRADES,
                period_id=period.id,
                teacher_assignment_id=teacher_assignment.id,
                valid_until__gte=timezone.now(),
            )

            has_full = active_grants.filter(grant_type=EditRequest.TYPE_FULL).exists()
            if not has_full:
                allowed_enrollment_ids = set(
                    EditGrantItem.objects.filter(grant__in=active_grants)
                    .values_list("enrollment_id", flat=True)
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

        blocked = []
        allowed_by_cell: dict[tuple[int, int], AchievementGrade] = {}
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

            if allowed_enrollment_ids is not None and enrollment_id not in allowed_enrollment_ids:
                blocked.append(
                    {
                        "enrollment": enrollment_id,
                        "achievement": achievement_id,
                        "reason": "EDIT_WINDOW_CLOSED",
                    }
                )
                continue

            # Deduplicate per cell (last write wins)
            allowed_by_cell[(enrollment_id, achievement_id)] = AchievementGrade(
                gradesheet=gradesheet,
                enrollment_id=enrollment_id,
                achievement_id=achievement_id,
                score=g.get("score"),
            )

        to_upsert = list(allowed_by_cell.values())

        if to_upsert:
            with transaction.atomic():
                AchievementGrade.objects.bulk_create(
                    to_upsert,
                    update_conflicts=True,
                    unique_fields=["gradesheet", "enrollment", "achievement"],
                    update_fields=["score", "updated_at"],
                )

        # Return recomputed final scores for impacted enrollments (for live UI updates)
        impacted_enrollment_ids = sorted({g.enrollment_id for g in to_upsert})

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
            {
                "requested": len(grades),
                "updated": len(to_upsert),
                "computed": computed,
                "blocked": blocked,
            },
            status=status.HTTP_200_OK,
        )


def _is_admin_like(user) -> bool:
    role = getattr(user, "role", None)
    return role in {"SUPERADMIN", "ADMIN", "COORDINATOR"}


class EditRequestViewSet(viewsets.ModelViewSet):
    queryset = EditRequest.objects.all().select_related(
        "requested_by",
        "period",
        "teacher_assignment",
        "decided_by",
    )
    serializer_class = EditRequestSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "scope", "period"]

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("items")
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if getattr(user, "role", None) == "TEACHER":
            return qs.filter(requested_by=user)
        if _is_admin_like(user):
            return qs
        return qs.none()

    def create(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if not user or getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo docentes pueden crear solicitudes."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        obj: EditRequest = serializer.save()

        # Notify admin-like users that there is a pending request
        try:
            from notifications.services import admin_like_users_qs, notify_users

            scope_label = "Calificaciones" if obj.scope == EditRequest.SCOPE_GRADES else "Planeación"
            teacher_name = getattr(obj.requested_by, "get_full_name", lambda: "")() or getattr(
                obj.requested_by, "username", "Docente"
            )
            title = f"Solicitud de edición pendiente ({scope_label})"
            body = f"{teacher_name} envió una solicitud para el periodo {obj.period_id}."
            url = (
                "/edit-requests/grades"
                if obj.scope == EditRequest.SCOPE_GRADES
                else "/edit-requests/planning"
            )
            notify_users(
                recipients=admin_like_users_qs(),
                type="EDIT_REQUEST_PENDING",
                title=title,
                body=body,
                url=url,
                dedupe_key=f"EDIT_REQUEST_PENDING:teacher={obj.requested_by_id}:scope={obj.scope}:period={obj.period_id}",
                dedupe_within_seconds=300,
            )
        except Exception:
            # Notifications must not break core flows
            pass

        return obj

    def update(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user and getattr(user, "role", None) == "TEACHER":
            return Response({"detail": "No puedes modificar una solicitud."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user and getattr(user, "role", None) == "TEACHER":
            return Response({"detail": "No puedes eliminar una solicitud."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="my")
    def my(self, request):
        user = getattr(request, "user", None)
        if not user or getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo docentes."}, status=status.HTTP_403_FORBIDDEN)
        qs = self.get_queryset().order_by("-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        user = getattr(request, "user", None)
        if not user or not _is_admin_like(user):
            return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

        edit_request: EditRequest = self.get_object()
        if edit_request.status != EditRequest.STATUS_PENDING:
            return Response({"detail": "La solicitud ya fue decidida."}, status=status.HTTP_400_BAD_REQUEST)

        decision = EditRequestDecisionSerializer(data=request.data)
        decision.is_valid(raise_exception=True)
        valid_until = decision.validated_data.get("valid_until") or edit_request.requested_until
        if valid_until is None:
            return Response({"valid_until": "Es requerido para aprobar."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            edit_request.status = EditRequest.STATUS_APPROVED
            edit_request.decided_by = user
            edit_request.decided_at = timezone.now()
            edit_request.decision_note = decision.validated_data.get("decision_note", "")
            edit_request.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

            grant = EditGrant.objects.create(
                scope=edit_request.scope,
                grant_type=edit_request.request_type,
                granted_to=edit_request.requested_by,
                period=edit_request.period,
                teacher_assignment=edit_request.teacher_assignment,
                valid_until=valid_until,
                created_by=user,
                source_request=edit_request,
            )

            if edit_request.request_type == EditRequest.TYPE_PARTIAL:
                items = list(edit_request.items.values_list("enrollment_id", flat=True))
                EditGrantItem.objects.bulk_create(
                    [EditGrantItem(grant=grant, enrollment_id=eid) for eid in items]
                )

            # Notify teacher
            try:
                from notifications.services import create_notification

                scope_label = "Calificaciones" if edit_request.scope == EditRequest.SCOPE_GRADES else "Planeación"
                title = f"Solicitud aprobada ({scope_label})"
                url = "/grades" if edit_request.scope == EditRequest.SCOPE_GRADES else "/planning"
                note = (edit_request.decision_note or "").strip()
                body = f"Aprobada hasta: {valid_until}." + (f"\nNota: {note}" if note else "")
                create_notification(
                    recipient=edit_request.requested_by,
                    type="EDIT_REQUEST_APPROVED",
                    title=title,
                    body=body,
                    url=url,
                )
            except Exception:
                pass

        return Response({"detail": "Solicitud aprobada.", "grant_id": grant.id}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        user = getattr(request, "user", None)
        if not user or not _is_admin_like(user):
            return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

        edit_request: EditRequest = self.get_object()
        if edit_request.status != EditRequest.STATUS_PENDING:
            return Response({"detail": "La solicitud ya fue decidida."}, status=status.HTTP_400_BAD_REQUEST)

        decision = EditRequestDecisionSerializer(data=request.data)
        decision.is_valid(raise_exception=True)

        edit_request.status = EditRequest.STATUS_REJECTED
        edit_request.decided_by = user
        edit_request.decided_at = timezone.now()
        edit_request.decision_note = decision.validated_data.get("decision_note", "")
        edit_request.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

        # Notify teacher
        try:
            from notifications.services import create_notification

            scope_label = "Calificaciones" if edit_request.scope == EditRequest.SCOPE_GRADES else "Planeación"
            title = f"Solicitud rechazada ({scope_label})"
            url = "/grades" if edit_request.scope == EditRequest.SCOPE_GRADES else "/planning"
            note = (edit_request.decision_note or "").strip()
            body = (f"Nota: {note}" if note else "")
            create_notification(
                recipient=edit_request.requested_by,
                type="EDIT_REQUEST_REJECTED",
                title=title,
                body=body,
                url=url,
            )
        except Exception:
            pass

        return Response({"detail": "Solicitud rechazada."}, status=status.HTTP_200_OK)


class EditGrantViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EditGrant.objects.all().select_related(
        "granted_to",
        "period",
        "teacher_assignment",
        "created_by",
        "source_request",
    )
    serializer_class = EditGrantSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["scope", "period", "teacher_assignment", "granted_to"]

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("items")
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if getattr(user, "role", None) == "TEACHER":
            return qs.filter(granted_to=user)
        if _is_admin_like(user):
            return qs
        return qs.none()

    @action(detail=False, methods=["get"], url_path="my")
    def my(self, request):
        user = getattr(request, "user", None)
        if not user or getattr(user, "role", None) != "TEACHER":
            return Response({"detail": "Solo docentes."}, status=status.HTTP_403_FORBIDDEN)
        qs = self.get_queryset().order_by("-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
