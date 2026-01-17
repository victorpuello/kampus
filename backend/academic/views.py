from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db import IntegrityError
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
    AchievementActivityColumn,
    AchievementActivityGrade,
    EditRequest,
    EditRequestItem,
    EditGrant,
    EditGrantItem,
)

from students.academic_period_report import generate_academic_period_group_report_pdf
from students.models import Enrollment
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
    GradeSheetGradingModeSerializer,
    AchievementActivityColumnSerializer,
    ActivityColumnsBulkUpsertSerializer,
    ActivityGradesBulkUpsertSerializer,
    EditRequestSerializer,
    EditRequestDecisionSerializer,
    EditGrantSerializer,
)
from .ai import AIService, AIConfigError, AIParseError, AIProviderError
from .grade_ordinals import guess_ordinal
from .grading import (
    DEFAULT_EMPTY_SCORE,
    coalesce_score,
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

        grade_id_raw = request.query_params.get("grade_id")
        grade_id = None
        if grade_id_raw not in (None, ""):
            try:
                grade_id = int(str(grade_id_raw))
            except Exception:
                return Response({"detail": "grade_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        passing_score_raw = request.query_params.get("passing_score")
        try:
            passing_score = PASSING_SCORE_DEFAULT if not passing_score_raw else Decimal(str(passing_score_raw))
        except Exception:
            return Response({"detail": "passing_score inválido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            computed = compute_promotions_for_year(academic_year=year, passing_score=passing_score)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        enrollments_qs = Enrollment.objects.filter(id__in=list(computed.keys())).select_related(
            "student",
            "student__user",
            "grade",
        )
        if grade_id is not None:
            enrollments_qs = enrollments_qs.filter(grade_id=grade_id)

        # Infer grade progression for UI (target grade per decision)
        grades = list(Grade.objects.all().only("id", "ordinal", "name", "level_id"))
        grade_name_by_id = {int(g.id): getattr(g, "name", "") for g in grades}
        ordinal_to_grade_id_by_level: dict[int, dict[int, int]] = {}
        ordinal_to_grade_id_global: dict[int, int] = {}
        for g in grades:
            ord_val = getattr(g, "ordinal", None)
            if ord_val is None:
                ord_val = guess_ordinal(getattr(g, "name", ""))
            if ord_val is None:
                continue
            o = int(ord_val)
            gid = int(g.id)
            lvl = int(getattr(g, "level_id", 0) or 0)
            ordinal_to_grade_id_by_level.setdefault(lvl, {}).setdefault(o, gid)
            ordinal_to_grade_id_global.setdefault(o, gid)

        def _grade_ordinal(current_grade: Grade) -> int | None:
            ord_val = getattr(current_grade, "ordinal", None)
            if ord_val is not None:
                return int(ord_val)
            guessed = guess_ordinal(getattr(current_grade, "name", ""))
            return int(guessed) if guessed is not None else None

        def next_grade_id(current_grade: Grade) -> int | None:
            ord_val = _grade_ordinal(current_grade)
            if ord_val is None:
                return None
            lvl = int(getattr(current_grade, "level_id", 0) or 0)
            per_level = ordinal_to_grade_id_by_level.get(lvl) or {}
            return per_level.get(ord_val + 1) or ordinal_to_grade_id_global.get(ord_val + 1)

        def is_last_grade(current_grade: Grade) -> bool:
            ord_val = _grade_ordinal(current_grade)
            if ord_val is not None:
                return ord_val >= 13
            return str(getattr(current_grade, "name", "")).strip().lower() in {"11", "11°", "once", "undecimo", "undécimo"}

        results = []
        for e in enrollments_qs.order_by("id"):
            c = computed.get(e.id)
            if not c:
                continue
            u = getattr(e.student, "user", None)
            student_name = ""
            if u is not None:
                student_name = u.get_full_name()

            grade_ord = _grade_ordinal(e.grade)
            target_grade_id = None
            if c.decision in {"PROMOTED", "CONDITIONAL"}:
                if not is_last_grade(e.grade):
                    target_grade_id = next_grade_id(e.grade)
            elif c.decision == "REPEATED":
                target_grade_id = int(e.grade_id)

            results.append(
                {
                    "enrollment_id": e.id,
                    "decision": c.decision,
                    "failed_subjects_count": len(c.failed_subject_ids),
                    "failed_areas_count": len(c.failed_area_ids),
                    "failed_subjects_distinct_areas_count": c.failed_subjects_distinct_areas_count,
                    "failed_subject_ids": c.failed_subject_ids,
                    "failed_area_ids": c.failed_area_ids,
                    "student_id": int(e.student_id),
                    "student_name": student_name,
                    "student_document_number": getattr(e.student, "document_number", ""),
                    "grade_id": int(e.grade_id),
                    "grade_name": getattr(e.grade, "name", ""),
                    "grade_ordinal": grade_ord,
                    "target_grade_id": int(target_grade_id) if target_grade_id is not None else None,
                    "target_grade_name": grade_name_by_id.get(int(target_grade_id)) if target_grade_id is not None else None,
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

        passing_score_raw = request.data.get("passing_score")
        try:
            passing_score = PASSING_SCORE_DEFAULT if passing_score_raw in (None, "") else Decimal(str(passing_score_raw))
        except Exception:
            return Response({"detail": "passing_score inválido"}, status=status.HTTP_400_BAD_REQUEST)

        enrollment_ids_raw = request.data.get("enrollment_ids")
        enrollment_ids = None
        if enrollment_ids_raw not in (None, ""):
            if not isinstance(enrollment_ids_raw, list):
                return Response({"detail": "enrollment_ids debe ser una lista"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                enrollment_ids = [int(x) for x in enrollment_ids_raw]
            except Exception:
                return Response({"detail": "enrollment_ids inválido"}, status=status.HTTP_400_BAD_REQUEST)

        source_grade_id_raw = request.data.get("source_grade_id")
        source_grade_id = None
        if source_grade_id_raw not in (None, ""):
            try:
                source_grade_id = int(str(source_grade_id_raw))
            except Exception:
                return Response({"detail": "source_grade_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

        exclude_repeated_raw = request.data.get("exclude_repeated")
        exclude_repeated = False
        if exclude_repeated_raw not in (None, ""):
            if isinstance(exclude_repeated_raw, bool):
                exclude_repeated = exclude_repeated_raw
            else:
                s = str(exclude_repeated_raw).strip().lower()
                exclude_repeated = s in {"1", "true", "t", "yes", "y", "si", "sí"}

        target_group_id_raw = request.data.get("target_group_id")
        target_group_id = None
        if target_group_id_raw not in (None, ""):
            try:
                target_group_id = int(str(target_group_id_raw))
            except Exception:
                return Response({"detail": "target_group_id inválido"}, status=status.HTTP_400_BAD_REQUEST)

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

        # Grade progression mapping using ordinal (with fallback inference from Grade.name)
        grades = list(Grade.objects.all().only("id", "ordinal", "name", "level_id"))
        ordinal_to_grade_id_by_level: dict[int, dict[int, int]] = {}
        ordinal_to_grade_id_global: dict[int, int] = {}

        for g in grades:
            ord_val = getattr(g, "ordinal", None)
            if ord_val is None:
                ord_val = guess_ordinal(getattr(g, "name", ""))
            if ord_val is None:
                continue
            o = int(ord_val)
            gid = int(g.id)
            lvl = int(getattr(g, "level_id", 0) or 0)
            ordinal_to_grade_id_by_level.setdefault(lvl, {}).setdefault(o, gid)
            ordinal_to_grade_id_global.setdefault(o, gid)

        def _grade_ordinal(current_grade: Grade) -> int | None:
            ord_val = getattr(current_grade, "ordinal", None)
            if ord_val is not None:
                return int(ord_val)
            guessed = guess_ordinal(getattr(current_grade, "name", ""))
            return int(guessed) if guessed is not None else None

        def next_grade_id(current_grade: Grade) -> int | None:
            ord_val = _grade_ordinal(current_grade)
            if ord_val is None:
                return None
            lvl = int(getattr(current_grade, "level_id", 0) or 0)
            per_level = ordinal_to_grade_id_by_level.get(lvl) or {}
            return per_level.get(ord_val + 1) or ordinal_to_grade_id_global.get(ord_val + 1)

        def is_last_grade(current_grade: Grade) -> bool:
            ord_val = _grade_ordinal(current_grade)
            if ord_val is not None:
                return ord_val >= 13
            return str(getattr(current_grade, "name", "")).strip().lower() in {"11", "11°", "once", "undecimo", "undécimo"}

        # Only ACTIVE enrollments are eligible for promotion.
        source_enrollments = Enrollment.objects.filter(academic_year=source_year, status="ACTIVE")
        if source_grade_id is not None:
            source_enrollments = source_enrollments.filter(grade_id=source_grade_id)
        if enrollment_ids is not None:
            source_enrollments = source_enrollments.filter(id__in=enrollment_ids)

        source_enrollments = source_enrollments.select_related("student", "grade", "grade__level").order_by("id")

        # Preload groups in target year for auto-assignment / validation
        target_groups = list(
            Group.objects.filter(academic_year=target_year)
            .only("id", "name", "grade_id", "campus_id", "shift")
            .order_by("grade_id", "name", "id")
        )
        groups_by_key: dict[tuple[int, int | None], list[Group]] = {}
        for g in target_groups:
            key = (int(g.grade_id), int(g.campus_id) if getattr(g, "campus_id", None) is not None else None)
            groups_by_key.setdefault(key, []).append(g)

        selected_group_obj = None
        if target_group_id is not None:
            selected_group_obj = next((g for g in target_groups if int(g.id) == int(target_group_id)), None)
            if selected_group_obj is None:
                return Response(
                    {"detail": "El grupo seleccionado no existe en el año destino."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        snapshots = {
            s.enrollment_id: s
            for s in EnrollmentPromotionSnapshot.objects.filter(enrollment__in=source_enrollments)
        }

        # Fallback: compute decisions on-the-fly when snapshots are missing.
        # This supports environments where the year is CLOSED but snapshots were never generated.
        computed = {}
        try:
            computed = compute_promotions_for_year(academic_year=source_year, passing_score=passing_score)
        except Exception:
            computed = {}

        created = 0
        skipped_existing = 0
        skipped_graduated = 0
        skipped_missing_grade_ordinal = 0
        skipped_repeated = 0

        # Pre-check ambiguity when there are multiple groups for the target grade.
        # Avoid partial creations: fail fast with the available options.
        source_student_ids = list(source_enrollments.values_list("student_id", flat=True))
        existing_in_target = set(
            Enrollment.objects.filter(academic_year=target_year, student_id__in=source_student_ids).values_list(
                "student_id", flat=True
            )
        )
        ambiguous_groups = []
        if target_group_id is None:
            for e in source_enrollments:
                if int(e.student_id) in existing_in_target:
                    continue

                snap = snapshots.get(e.id)
                decision = None
                if snap is not None:
                    decision = snap.decision
                else:
                    c = computed.get(e.id)
                    if c is None:
                        continue
                    decision = c.decision

                if exclude_repeated and decision == "REPEATED":
                    continue
                if e.status == "GRADUATED" or decision == "GRADUATED":
                    continue
                if decision == "PROMOTED" and is_last_grade(e.grade):
                    continue

                if decision in {"PROMOTED", "CONDITIONAL"}:
                    ngid = next_grade_id(e.grade)
                    if ngid is None:
                        continue
                    target_grade_id = int(ngid)
                else:
                    target_grade_id = int(e.grade_id)

                campus_id = int(e.campus_id) if getattr(e, "campus_id", None) is not None else None
                candidates = groups_by_key.get((target_grade_id, campus_id), [])
                if not candidates and campus_id is not None:
                    candidates = groups_by_key.get((target_grade_id, None), [])

                if len(candidates) > 1:
                    ambiguous_groups.append(
                        {
                            "enrollment_id": int(e.id),
                            "target_grade_id": int(target_grade_id),
                            "campus_id": campus_id,
                            "groups": [
                                {
                                    "id": int(g.id),
                                    "name": g.name,
                                    "shift": getattr(g, "shift", None),
                                    "campus_id": int(g.campus_id) if getattr(g, "campus_id", None) is not None else None,
                                }
                                for g in candidates
                            ],
                        }
                    )

            if ambiguous_groups:
                return Response(
                    {
                        "detail": "Hay más de un grupo para el grado destino. Selecciona un grupo para aplicar promociones.",
                        "ambiguous_groups": ambiguous_groups,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            for e in source_enrollments:
                snap = snapshots.get(e.id)
                decision = None
                details = {}
                if snap is not None:
                    decision = snap.decision
                    details = snap.details or {}
                else:
                    c = computed.get(e.id)
                    if c is None:
                        continue
                    decision = c.decision
                    details = {"failed_subject_ids": c.failed_subject_ids, "failed_area_ids": c.failed_area_ids}

                # Exclude REPEATED when requested
                if exclude_repeated and decision == "REPEATED":
                    skipped_repeated += 1
                    continue

                # Skip already graduated students
                if e.status == "GRADUATED" or decision == "GRADUATED":
                    skipped_graduated += 1
                    continue

                # Last grade promoted => treated as graduated (no next-year enrollment)
                if decision == "PROMOTED" and is_last_grade(e.grade):
                    skipped_graduated += 1
                    continue

                # Decide target grade
                if decision in {"PROMOTED", "CONDITIONAL"}:
                    ngid = next_grade_id(e.grade)
                    if ngid is None:
                        skipped_missing_grade_ordinal += 1
                        continue
                    target_grade_id = ngid
                else:
                    # REPEATED => stays in same grade
                    target_grade_id = e.grade_id

                # Determine target group
                assigned_group_id = None
                if selected_group_obj is not None:
                    # Ensure chosen group matches the target grade and (if present) campus
                    if int(selected_group_obj.grade_id) != int(target_grade_id):
                        return Response(
                            {"detail": "El grupo seleccionado no corresponde al grado destino."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    if getattr(e, "campus_id", None) is not None and getattr(selected_group_obj, "campus_id", None) is not None:
                        if int(selected_group_obj.campus_id) != int(e.campus_id):
                            return Response(
                                {"detail": "El grupo seleccionado no corresponde a la sede (campus) de la matrícula."},
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                    assigned_group_id = int(selected_group_obj.id)
                else:
                    campus_id = int(e.campus_id) if getattr(e, "campus_id", None) is not None else None
                    candidates = groups_by_key.get((int(target_grade_id), campus_id), [])
                    if not candidates and campus_id is not None:
                        candidates = groups_by_key.get((int(target_grade_id), None), [])
                    if len(candidates) == 1:
                        assigned_group_id = int(candidates[0].id)

                # Ensure uniqueness (student, academic_year)
                if Enrollment.objects.filter(student=e.student, academic_year=target_year).exists():
                    skipped_existing += 1
                    continue

                new_enrollment = Enrollment.objects.create(
                    student=e.student,
                    academic_year=target_year,
                    grade_id=target_grade_id,
                    group_id=assigned_group_id,
                    campus=e.campus,
                    status="ACTIVE",
                    origin_school=e.origin_school,
                    final_status="",
                    enrolled_at=None,
                )
                created += 1

                # Create conditional promotion plan (PAP placeholder)
                if decision == "CONDITIONAL":
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
                "skipped_repeated": skipped_repeated,
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

    @action(
        detail=True,
        methods=["get"],
        url_path="academic-report",
        permission_classes=[IsAuthenticated],
    )
    def academic_report(self, request, pk=None):
        """Genera informe académico por periodos para un grupo.

        GET /api/groups/{id}/academic-report/?period=<period_id>
        """

        def _to_int_or_none(value):
            if value is None:
                return None
            raw = str(value).strip()
            if raw == "":
                return None
            try:
                return int(raw)
            except Exception:
                return None

        period_id = _to_int_or_none(request.query_params.get("period"))
        if period_id is None:
            return Response({"detail": "period is required"}, status=status.HTTP_400_BAD_REQUEST)

        group: Group = self.get_object()

        user = getattr(request, "user", None)
        role = getattr(user, "role", None)
        if role not in {"SUPERADMIN", "ADMIN", "COORDINATOR"}:
            if role == "TEACHER":
                teacher_id = getattr(user, "id", None)
                is_director = group.director_id == teacher_id
                is_assigned = (
                    TeacherAssignment.objects.filter(teacher_id=teacher_id, group_id=group.id).exists()
                    if teacher_id is not None
                    else False
                )
                if not (is_director or is_assigned):
                    return Response(
                        {"detail": "No tienes permisos para ver este informe."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            else:
                return Response(
                    {"detail": "No tienes permisos para ver este informe."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            period = Period.objects.select_related("academic_year").get(id=period_id)
        except Period.DoesNotExist:
            return Response({"detail": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if period.academic_year_id != group.academic_year_id:
            return Response(
                {"detail": "El periodo no corresponde al año lectivo del grupo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollments = (
            Enrollment.objects.select_related(
                "student",
                "student__user",
                "grade",
                "group",
                "group__director",
                "academic_year",
            )
            .filter(group_id=group.id, academic_year_id=period.academic_year_id, status="ACTIVE")
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )

        if not enrollments.exists():
            return Response(
                {"detail": "No hay matrículas activas en este grupo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pdf_bytes = generate_academic_period_group_report_pdf(enrollments=enrollments, period=period)
            filename = f"informe-academico-grupo-{group.id}-period-{period.id}.pdf"
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            return response
        except Exception as e:
            payload = {"detail": "Error generating PDF", "error": str(e)}
            from django.conf import settings as _settings
            import traceback as _traceback

            if getattr(_settings, "DEBUG", False):
                payload["traceback"] = _traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(
        detail=True,
        methods=["get"],
        url_path="grade-report-sheet",
        permission_classes=[IsAuthenticated],
    )
    def grade_report_sheet(self, request, pk=None):
        """Genera planilla imprimible de notas (en blanco) para un grupo.

        GET /api/groups/{id}/grade-report-sheet/?format=pdf|html&period=<period_id>&subject=<text>&teacher=<text>&columns=<int>
        """

        def _to_int_or_none(value):
            if value is None:
                return None
            raw = str(value).strip()
            if raw == "":
                return None
            try:
                return int(raw)
            except Exception:
                return None

        def _upper(s: str) -> str:
            return (s or "").strip().upper()

        group: Group = self.get_object()

        user = getattr(request, "user", None)
        role = getattr(user, "role", None)
        if role == "TEACHER":
            if not (group.director_id == getattr(user, "id", None) or TeacherAssignment.objects.filter(teacher_id=user.id, group_id=group.id).exists()):
                return Response({"detail": "No autorizado"}, status=status.HTTP_403_FORBIDDEN)

        fmt = (request.query_params.get("format") or "pdf").strip().lower()

        try:
            note_cols = int(request.query_params.get("columns") or "3")
        except Exception:
            note_cols = 3
        note_cols = max(1, min(note_cols, 12))
        note_columns = [f"Nota {i}" for i in range(1, note_cols + 1)]

        period_id = _to_int_or_none(request.query_params.get("period"))
        period_name = ""
        if period_id is not None:
            try:
                period = Period.objects.select_related("academic_year").get(id=period_id)
                if period.academic_year_id == group.academic_year_id:
                    period_name = (period.name or "").strip()
            except Period.DoesNotExist:
                period_name = ""

        subject_name = (request.query_params.get("subject") or "").strip()

        teacher_name = ""
        teacher_param = (request.query_params.get("teacher") or "").strip()
        if teacher_param:
            teacher_name = teacher_param
        else:
            try:
                if getattr(user, "is_authenticated", False) and getattr(user, "role", None) == "TEACHER":
                    teacher_name = _upper(user.get_full_name())
            except Exception:
                teacher_name = ""

        enrollments = (
            Enrollment.objects.select_related("student", "student__user")
            .filter(academic_year_id=group.academic_year_id, group_id=group.id, status="ACTIVE")
            .order_by("student__user__last_name", "student__user__first_name", "student__user__id")
        )

        def _display_name(e: Enrollment) -> str:
            last_name = (e.student.user.last_name or "").strip().upper()
            first_name = (e.student.user.first_name or "").strip().upper()
            full = (last_name + " " + first_name).strip()
            return full or e.student.user.get_full_name().upper() or ""

        students = [{"index": i + 1, "display_name": _display_name(e)} for i, e in enumerate(enrollments)]

        grade_label = str(getattr(group.grade, "name", "")).strip() if getattr(group, "grade", None) else ""
        group_label = f"{grade_label}-{group.name}" if grade_label else str(group.name)
        d = timezone.localdate()
        printed_at = f"{d.month}/{d.day}/{d.year}"

        director_name = ""
        try:
            if group.director:
                director_name = _upper(group.director.get_full_name())
        except Exception:
            director_name = ""

        from core.models import Institution

        institution = Institution.objects.first() or Institution(name="")

        from django.template.loader import render_to_string

        html_string = render_to_string(
            "academic/reports/grade_report_sheet_pdf.html",
            {
                "institution": institution,
                "teacher_name": teacher_name,
                "group_label": group_label,
                "shift": group.get_shift_display(),
                "printed_at": printed_at,
                "period_name": period_name,
                "subject_name": subject_name,
                "director_name": director_name,
                "students": students,
                "note_columns": note_columns,
            },
        )

        if fmt == "html":
            from django.http import HttpResponse

            return HttpResponse(html_string, content_type="text/html; charset=utf-8")

        try:
            import io
            import os
            import traceback

            from django.conf import settings
            from django.http import HttpResponse
            from xhtml2pdf import pisa

            def _pisa_link_callback(uri: str, rel: str | None = None):
                if uri.startswith("http://") or uri.startswith("https://"):
                    return uri

                media_url = getattr(settings, "MEDIA_URL", "") or ""
                static_url = getattr(settings, "STATIC_URL", "") or ""

                if media_url and uri.startswith(media_url):
                    path = os.path.join(settings.MEDIA_ROOT, uri[len(media_url) :].lstrip("/\\"))
                    return os.path.normpath(path)

                if static_url and uri.startswith(static_url):
                    static_root = getattr(settings, "STATIC_ROOT", None)
                    if static_root:
                        path = os.path.join(static_root, uri[len(static_url) :].lstrip("/\\"))
                        return os.path.normpath(path)

                return uri

            result = io.BytesIO()
            pdf = pisa.pisaDocument(
                io.BytesIO(html_string.encode("UTF-8")),
                result,
                link_callback=_pisa_link_callback,
                encoding="UTF-8",
            )

            if pdf.err:
                return Response(
                    {"detail": "Error generando PDF", "pisa_errors": getattr(pdf, "err", None)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            filename = f"planilla_notas_{group_label}.pdf".replace(" ", "_")
            response = HttpResponse(result.getvalue(), content_type="application/pdf")
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            return response
        except Exception as e:
            from django.conf import settings as _settings

            payload = {"detail": "Error generando PDF", "error": str(e)}
            if getattr(_settings, "DEBUG", False):
                payload["traceback"] = traceback.format_exc()
            return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

    def get_permissions(self):
        # Creating/editing achievements is a teacher workflow in the UI, but teachers may not
        # have Django model add/change permissions assigned. We gate it by role instead.
        if getattr(self, "action", None) in {"create", "update", "partial_update", "destroy"}:
            return [IsAuthenticated()]
        return super().get_permissions()

    def _ensure_can_manage_achievements(self, request):
        role = getattr(getattr(request, 'user', None), 'role', None)
        if role in {'TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN'}:
            return None
        return Response({"detail": "No tienes permisos para gestionar logros."}, status=status.HTTP_403_FORBIDDEN)

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

    def _ensure_can_use_ai(self, request):
        role = getattr(getattr(request, 'user', None), 'role', None)
        if role in {'TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN'}:
            return None
        return Response({"detail": "No tienes permisos para usar esta función."}, status=status.HTTP_403_FORBIDDEN)

    def create(self, request, *args, **kwargs):
        denied = self._ensure_can_manage_achievements(request)
        if denied is not None:
            return denied

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
        denied = self._ensure_can_manage_achievements(request)
        if denied is not None:
            return denied

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
        denied = self._ensure_can_manage_achievements(request)
        if denied is not None:
            return denied

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

    @action(detail=False, methods=['post'], url_path='generate-indicators', permission_classes=[IsAuthenticated])
    def generate_indicators(self, request):
        """
        Genera sugerencias de indicadores usando IA.
        Body: { "description": "..." }
        """
        denied = self._ensure_can_use_ai(request)
        if denied is not None:
            return denied

        description = request.data.get('description')
        if not description:
            return Response({"detail": "Description is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            ai_service = AIService()
            indicators = ai_service.generate_indicators(description)
            return Response(indicators)
        except AIConfigError as e:
            return Response(
                {"detail": str(e), "code": "AI_NOT_CONFIGURED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AIParseError:
            # The provider responded, but it wasn't usable JSON. Encourage retry.
            return Response(
                {
                    "detail": "La IA devolvió una respuesta inválida. Intenta nuevamente.",
                    "code": "AI_INVALID_RESPONSE",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except AIProviderError:
            return Response(
                {
                    "detail": "No se pudo generar con IA en este momento. Intenta nuevamente.",
                    "code": "AI_PROVIDER_ERROR",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'], url_path='create-indicators', permission_classes=[IsAuthenticated])
    def create_indicators(self, request, pk=None):
        """
        Crea indicadores masivamente para un logro existente.
        Body: { "indicators": [ {"level": "LOW", "description": "..."}, ... ] }
        """
        achievement = self.get_object()

        denied = self._ensure_can_use_ai(request)
        if denied is not None:
            return denied

        user = getattr(request, "user", None)
        if user is not None and getattr(user, "role", None) == "TEACHER":
            period = getattr(achievement, "period", None)
            if period is not None and not self._teacher_can_edit_planning(user, period):
                return Response(
                    {"detail": "La edición de planeación está cerrada para este periodo.", "code": "EDIT_WINDOW_CLOSED"},
                    status=status.HTTP_403_FORBIDDEN,
                )

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

    def _enforce_teacher_current_period(self, *, user, period: Period):
        """Teachers can only work with the *current* period.

        Current period means: today's date is within [start_date, end_date].
        This prevents exposing future-period grade sheets to teachers.
        """

        is_teacher = user is not None and getattr(user, "role", None) == "TEACHER"
        if not is_teacher:
            return None

        today = timezone.localdate()
        if today < period.start_date or today > period.end_date:
            return Response(
                {
                    "error": "Solo se pueden diligenciar planillas del periodo actual.",
                    "code": "PERIOD_NOT_CURRENT",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return None

    def get_queryset(self):
        qs = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        if getattr(user, "role", None) == "TEACHER":
            return qs.filter(teacher_assignment__teacher=user)
        return qs

    @action(detail=True, methods=["post"], url_path="reset")
    def reset(self, request, pk=None):
        """Teacher can reset (clear) all grades/activities for a grade sheet.

        - Only allowed for the current period.
        - Respects the edit window: after deadline, requires FULL grant.
        - Resets grading_mode back to ACHIEVEMENT.
        """

        gradesheet: GradeSheet = self.get_object()
        period: Period = gradesheet.period
        teacher_assignment: TeacherAssignment = gradesheet.teacher_assignment

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

        if period.is_closed:
            return Response(
                {"error": "El periodo está cerrado; no se puede restablecer la planilla."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not self._teacher_can_edit_structure_after_deadline(
            user=request.user,
            period=period,
            teacher_assignment=teacher_assignment,
        ):
            return Response(
                {"detail": "La edición está cerrada y no tienes permiso para restablecer la planilla."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            col_ids = list(
                AchievementActivityColumn.objects.filter(gradesheet=gradesheet)
                .values_list("id", flat=True)
            )

            deleted_activity_grades = 0
            if col_ids:
                deleted_activity_grades = AchievementActivityGrade.objects.filter(column_id__in=col_ids).delete()[0]

            deleted_activity_columns = AchievementActivityColumn.objects.filter(gradesheet=gradesheet).delete()[0]
            deleted_achievement_grades = AchievementGrade.objects.filter(gradesheet=gradesheet).delete()[0]

            reset_mode = False
            if getattr(gradesheet, "grading_mode", None) != GradeSheet.GRADING_MODE_ACHIEVEMENT:
                gradesheet.grading_mode = GradeSheet.GRADING_MODE_ACHIEVEMENT
                gradesheet.save(update_fields=["grading_mode"])
                reset_mode = True

        return Response(
            {
                "detail": "Planilla restablecida.",
                "deleted": {
                    "achievement_grades": deleted_achievement_grades,
                    "activity_columns": deleted_activity_columns,
                    "activity_grades": deleted_activity_grades,
                },
                "reset_grading_mode": reset_mode,
            },
            status=status.HTTP_200_OK,
        )

    def _get_teacher_assignment(self, teacher_assignment_id: int):
        qs = TeacherAssignment.objects.all()
        if getattr(self.request.user, "role", None) == "TEACHER":
            qs = qs.filter(teacher=self.request.user)
        return qs.select_related("academic_year", "group", "academic_load").get(id=teacher_assignment_id)

    def _teacher_allowed_enrollment_ids_after_deadline(
        self,
        *,
        user,
        period: Period,
        teacher_assignment: TeacherAssignment,
    ) -> set[int] | None:
        """Returns None when unrestricted, else the enrollment_id set allowed.

        Mirrors the Gradebook bulk-upsert behavior.
        """

        is_teacher = user is not None and getattr(user, "role", None) == "TEACHER"
        if not is_teacher:
            return None

        effective_deadline = period.grades_edit_until
        if effective_deadline is None:
            return None
        if timezone.now() <= effective_deadline:
            return None

        active_grants = EditGrant.objects.filter(
            granted_to=user,
            scope=EditRequest.SCOPE_GRADES,
            period_id=period.id,
            teacher_assignment_id=teacher_assignment.id,
            valid_until__gte=timezone.now(),
        )

        has_full = active_grants.filter(grant_type=EditRequest.TYPE_FULL).exists()
        if has_full:
            return None

        return set(
            EditGrantItem.objects.filter(grant__in=active_grants).values_list("enrollment_id", flat=True)
        )

    def _teacher_can_edit_structure_after_deadline(
        self,
        *,
        user,
        period: Period,
        teacher_assignment: TeacherAssignment,
    ) -> bool:
        """Whether a teacher can edit gradebook structure (activity columns) after deadline.

        We require a FULL grant when the deadline has passed.
        """

        is_teacher = user is not None and getattr(user, "role", None) == "TEACHER"
        if not is_teacher:
            return True
        if period.grades_edit_until is None or timezone.now() <= period.grades_edit_until:
            return True

        return EditGrant.objects.filter(
            granted_to=user,
            scope=EditRequest.SCOPE_GRADES,
            period_id=period.id,
            teacher_assignment_id=teacher_assignment.id,
            valid_until__gte=timezone.now(),
            grant_type=EditRequest.TYPE_FULL,
        ).exists()

    def _valid_achievements_for_assignment_period(
        self,
        *,
        teacher_assignment: TeacherAssignment,
        period: Period,
    ):
        base_achievements = Achievement.objects.filter(
            academic_load=teacher_assignment.academic_load,
            period=period,
        )

        group_achievements = base_achievements.filter(group=teacher_assignment.group)
        if group_achievements.exists():
            return group_achievements
        return base_achievements.filter(group__isnull=True)

    def _recompute_achievement_grades_from_activities(
        self,
        *,
        gradesheet: GradeSheet,
        achievement_ids: set[int],
        enrollment_ids: set[int],
    ) -> int:
        """Recompute (and persist) logro grades from activity grades.

        Rule: simple average; missing activity scores count as 1.00.
        Returns the number of AchievementGrade rows upserted.
        """

        if not achievement_ids or not enrollment_ids:
            return 0

        columns = list(
            AchievementActivityColumn.objects.filter(
                gradesheet=gradesheet,
                achievement_id__in=list(achievement_ids),
                is_active=True,
            ).only("id", "achievement_id")
        )
        if not columns:
            return 0

        column_ids = [c.id for c in columns]
        columns_by_achievement: dict[int, list[int]] = {}
        for c in columns:
            columns_by_achievement.setdefault(int(c.achievement_id), []).append(int(c.id))

        grades = list(
            AchievementActivityGrade.objects.filter(
                column_id__in=column_ids,
                enrollment_id__in=list(enrollment_ids),
            ).only("column_id", "enrollment_id", "score")
        )

        score_by_col_enr: dict[tuple[int, int], Decimal | None] = {
            (int(g.column_id), int(g.enrollment_id)): g.score for g in grades
        }

        to_upsert: list[AchievementGrade] = []
        for achievement_id, ach_column_ids in columns_by_achievement.items():
            denom = Decimal(len(ach_column_ids))
            for enrollment_id in enrollment_ids:
                total = sum(
                    coalesce_score(score_by_col_enr.get((col_id, int(enrollment_id))))
                    for col_id in ach_column_ids
                )
                avg = (total / denom).quantize(Decimal("0.01"))
                to_upsert.append(
                    AchievementGrade(
                        gradesheet=gradesheet,
                        enrollment_id=int(enrollment_id),
                        achievement_id=int(achievement_id),
                        score=avg,
                    )
                )

        AchievementGrade.objects.bulk_create(
            to_upsert,
            update_conflicts=True,
            unique_fields=["gradesheet", "enrollment", "achievement"],
            update_fields=["score", "updated_at"],
        )
        return len(to_upsert)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        period_id = request.query_params.get("period")
        if not period_id:
            return Response({"error": "period es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            period = Period.objects.select_related("academic_year").get(id=int(period_id))
        except Period.DoesNotExist:
            return Response({"error": "Periodo no encontrado"}, status=status.HTTP_404_NOT_FOUND)

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

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

        payload = {
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

        # Activities mode payload (columns + per-column grades)
        if getattr(gradesheet, "grading_mode", None) == GradeSheet.GRADING_MODE_ACTIVITIES:
            activity_columns = AchievementActivityColumn.objects.filter(
                gradesheet=gradesheet,
                achievement__in=achievements,
            ).order_by("achievement_id", "order", "id")

            activity_grades = AchievementActivityGrade.objects.filter(
                column__in=activity_columns,
                enrollment__in=enrollments,
            ).only("column_id", "enrollment_id", "score")
            activity_score_by_cell = {
                (g.enrollment_id, g.column_id): g.score for g in activity_grades
            }

            payload["activity_columns"] = AchievementActivityColumnSerializer(activity_columns, many=True).data
            payload["activity_cells"] = [
                {
                    "enrollment": e.id,
                    "column": c.id,
                    "score": activity_score_by_cell.get((e.id, c.id)),
                }
                for e in enrollments
                for c in activity_columns
            ]

        return Response(payload)

    @action(detail=False, methods=["post"], url_path="set-grading-mode")
    def set_grading_mode(self, request):
        serializer = GradeSheetGradingModeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        teacher_assignment_id = serializer.validated_data["teacher_assignment"]
        period_id = serializer.validated_data["period"]
        grading_mode = serializer.validated_data["grading_mode"]
        default_columns = serializer.validated_data.get("default_columns")

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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

        if period.is_closed:
            return Response(
                {"error": "El periodo está cerrado; no se puede modificar la planilla."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = getattr(request, "user", None)
        if not self._teacher_can_edit_structure_after_deadline(
            user=user,
            period=period,
            teacher_assignment=teacher_assignment,
        ):
            return Response(
                {"detail": "La ventana de edición está cerrada para modificar columnas."},
                status=status.HTTP_403_FORBIDDEN,
            )

        gradesheet, _ = GradeSheet.objects.get_or_create(
            teacher_assignment=teacher_assignment,
            period=period,
        )

        created_columns = 0
        with transaction.atomic():
            if gradesheet.grading_mode != grading_mode:
                gradesheet.grading_mode = grading_mode
                gradesheet.save(update_fields=["grading_mode", "updated_at"])

            if grading_mode == GradeSheet.GRADING_MODE_ACTIVITIES:
                n = 2 if default_columns is None else int(default_columns)
                if n > 0:
                    achievements = self._valid_achievements_for_assignment_period(
                        teacher_assignment=teacher_assignment,
                        period=period,
                    ).only("id")
                    existing_pairs = set(
                        AchievementActivityColumn.objects.filter(
                            gradesheet=gradesheet,
                            achievement__in=achievements,
                        ).values_list("achievement_id", flat=True)
                    )

                    to_create = []
                    for a in achievements:
                        if int(a.id) in existing_pairs:
                            continue
                        for i in range(1, n + 1):
                            to_create.append(
                                AchievementActivityColumn(
                                    gradesheet=gradesheet,
                                    achievement_id=int(a.id),
                                    label=f"Actividad {i}",
                                    order=i,
                                    is_active=True,
                                )
                            )
                    if to_create:
                        AchievementActivityColumn.objects.bulk_create(to_create)
                        created_columns = len(to_create)

        return Response(
            {
                "gradesheet": GradeSheetSerializer(gradesheet).data,
                "created_columns": created_columns,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="activity-columns")
    def activity_columns(self, request):
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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

        gradesheet, _ = GradeSheet.objects.get_or_create(
            teacher_assignment=teacher_assignment,
            period=period,
        )

        achievements = self._valid_achievements_for_assignment_period(
            teacher_assignment=teacher_assignment,
            period=period,
        ).only("id")

        cols = AchievementActivityColumn.objects.filter(
            gradesheet=gradesheet,
            achievement__in=achievements,
        ).order_by("achievement_id", "order", "id")

        return Response(
            {
                "gradesheet": GradeSheetSerializer(gradesheet).data,
                "columns": AchievementActivityColumnSerializer(cols, many=True).data,
            }
        )

    @action(detail=False, methods=["post"], url_path="activity-columns/bulk-upsert")
    def activity_columns_bulk_upsert(self, request):
        serializer = ActivityColumnsBulkUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        teacher_assignment_id = serializer.validated_data["teacher_assignment"]
        period_id = serializer.validated_data["period"]
        columns_payload = serializer.validated_data["columns"]

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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

        if period.is_closed:
            return Response(
                {"error": "El periodo está cerrado; no se pueden modificar columnas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = getattr(request, "user", None)
        if not self._teacher_can_edit_structure_after_deadline(
            user=user,
            period=period,
            teacher_assignment=teacher_assignment,
        ):
            return Response(
                {"detail": "La ventana de edición está cerrada para modificar columnas."},
                status=status.HTTP_403_FORBIDDEN,
            )

        gradesheet, _ = GradeSheet.objects.get_or_create(
            teacher_assignment=teacher_assignment,
            period=period,
        )

        achievements_qs = self._valid_achievements_for_assignment_period(
            teacher_assignment=teacher_assignment,
            period=period,
        )
        valid_achievement_ids = set(achievements_qs.values_list("id", flat=True))

        # Load existing columns for conflict detection
        existing_cols = list(
            AchievementActivityColumn.objects.filter(
                gradesheet=gradesheet,
                achievement_id__in=list(valid_achievement_ids),
            ).only("id", "achievement_id", "order")
        )
        existing_by_id = {int(c.id): c for c in existing_cols}
        existing_taken: dict[tuple[int, int], int] = {
            (int(c.achievement_id), int(c.order)): int(c.id) for c in existing_cols
        }

        # Precompute next order per achievement when omitted
        max_order_by_ach: dict[int, int] = {}
        for c in existing_cols:
            aid = int(c.achievement_id)
            max_order_by_ach[aid] = max(max_order_by_ach.get(aid, 0), int(c.order))

        desired_keys: dict[tuple[int, int], int | None] = {}
        to_create: list[AchievementActivityColumn] = []
        to_update: list[AchievementActivityColumn] = []

        for item in columns_payload:
            col_id = item.get("id")
            achievement_id = int(item["achievement"])
            if achievement_id not in valid_achievement_ids:
                return Response(
                    {"error": f"Achievement inválido: {achievement_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order = item.get("order")
            if order in (None, ""):
                max_order_by_ach[achievement_id] = max_order_by_ach.get(achievement_id, 0) + 1
                order = max_order_by_ach[achievement_id]
            order = int(order)

            key = (achievement_id, order)
            if key in desired_keys:
                return Response(
                    {"error": f"Orden duplicado en payload para achievement={achievement_id} order={order}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            desired_keys[key] = int(col_id) if col_id else None

            # Conflict with existing db row not being updated to this id
            taken_id = existing_taken.get(key)
            if taken_id is not None and (not col_id or int(col_id) != int(taken_id)):
                return Response(
                    {"error": f"Ya existe una columna con achievement={achievement_id} y order={order}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            label = item["label"]
            is_active = bool(item.get("is_active", True))

            if col_id:
                existing = existing_by_id.get(int(col_id))
                if not existing or int(existing.achievement_id) != achievement_id:
                    return Response(
                        {"error": f"Columna inválida o no pertenece a la planilla: {col_id}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                existing.label = label
                existing.order = order
                existing.is_active = is_active
                to_update.append(existing)
            else:
                to_create.append(
                    AchievementActivityColumn(
                        gradesheet=gradesheet,
                        achievement_id=achievement_id,
                        label=label,
                        order=order,
                        is_active=is_active,
                    )
                )

        with transaction.atomic():
            if to_create:
                AchievementActivityColumn.objects.bulk_create(to_create)
            if to_update:
                AchievementActivityColumn.objects.bulk_update(to_update, ["label", "order", "is_active", "updated_at"])

        cols = AchievementActivityColumn.objects.filter(
            gradesheet=gradesheet,
            achievement_id__in=list(valid_achievement_ids),
        ).order_by("achievement_id", "order", "id")

        return Response(
            {
                "created": len(to_create),
                "updated": len(to_update),
                "columns": AchievementActivityColumnSerializer(cols, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="activity-grades/bulk-upsert")
    def activity_grades_bulk_upsert(self, request):
        serializer = ActivityGradesBulkUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        teacher_assignment_id = serializer.validated_data["teacher_assignment"]
        period_id = serializer.validated_data["period"]
        grades_payload = serializer.validated_data["grades"]

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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

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

        achievements_qs = self._valid_achievements_for_assignment_period(
            teacher_assignment=teacher_assignment,
            period=period,
        )
        valid_achievement_ids = set(achievements_qs.values_list("id", flat=True))

        user = getattr(request, "user", None)
        allowed_enrollment_ids = self._teacher_allowed_enrollment_ids_after_deadline(
            user=user,
            period=period,
            teacher_assignment=teacher_assignment,
        )

        column_ids = sorted({int(g["column"]) for g in grades_payload})
        columns = list(
            AchievementActivityColumn.objects.filter(
                id__in=column_ids,
                gradesheet=gradesheet,
                is_active=True,
            ).only("id", "achievement_id")
        )
        columns_by_id = {int(c.id): c for c in columns}
        if len(columns_by_id) != len(column_ids):
            return Response(
                {"error": "Una o más columnas son inválidas o no pertenecen a la planilla."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blocked = []
        allowed_by_cell: dict[tuple[int, int], AchievementActivityGrade] = {}
        impacted_enrollment_ids: set[int] = set()
        impacted_achievement_ids: set[int] = set()

        for g in grades_payload:
            enrollment_id = int(g["enrollment"])
            column_id = int(g["column"])
            if enrollment_id not in valid_enrollments:
                return Response(
                    {"error": f"Enrollment inválido: {enrollment_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            column_obj = columns_by_id.get(column_id)
            achievement_id = int(getattr(column_obj, "achievement_id"))
            if achievement_id not in valid_achievement_ids:
                return Response(
                    {"error": f"Achievement inválido para la columna: {achievement_id}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if allowed_enrollment_ids is not None and enrollment_id not in allowed_enrollment_ids:
                blocked.append(
                    {
                        "enrollment": enrollment_id,
                        "column": column_id,
                        "reason": "EDIT_WINDOW_CLOSED",
                    }
                )
                continue

            impacted_enrollment_ids.add(enrollment_id)
            impacted_achievement_ids.add(achievement_id)

            allowed_by_cell[(column_id, enrollment_id)] = AchievementActivityGrade(
                column_id=column_id,
                enrollment_id=enrollment_id,
                score=g.get("score"),
            )

        to_upsert = list(allowed_by_cell.values())
        if to_upsert:
            with transaction.atomic():
                AchievementActivityGrade.objects.bulk_create(
                    to_upsert,
                    update_conflicts=True,
                    unique_fields=["column", "enrollment"],
                    update_fields=["score", "updated_at"],
                )

                recomputed = self._recompute_achievement_grades_from_activities(
                    gradesheet=gradesheet,
                    achievement_ids=impacted_achievement_ids,
                    enrollment_ids=impacted_enrollment_ids,
                )

        else:
            recomputed = 0

        # Return recomputed final scores for impacted enrollments
        impacted_enrollment_ids_sorted = sorted(impacted_enrollment_ids)

        achievements = achievements_qs.select_related("dimension").order_by("id")

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
            enrollment_id__in=impacted_enrollment_ids_sorted,
            achievement__in=achievements,
        ).only("enrollment_id", "achievement_id", "score")
        score_by_cell = {(g.enrollment_id, g.achievement_id): g.score for g in existing_grades}

        computed = []
        for enrollment_id in impacted_enrollment_ids_sorted:
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
                "requested": len(grades_payload),
                "updated": len(to_upsert),
                "recomputed_achievement_grades": recomputed,
                "computed": computed,
                "blocked": blocked,
            },
            status=status.HTTP_200_OK,
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

        current_resp = self._enforce_teacher_current_period(user=request.user, period=period)
        if current_resp is not None:
            return current_resp

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
