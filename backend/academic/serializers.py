from rest_framework import serializers

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

from django.utils import timezone


class AcademicLoadSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)

    class Meta:
        model = AcademicLoad
        fields = "__all__"


class AcademicYearSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = AcademicYear
        fields = ["id", "year", "status", "status_display", "start_date", "end_date"]
        read_only_fields = ["id", "status_display"]


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = "__all__"

    def validate(self, data):
        # Prevent creating/updating periods in finalized academic years
        academic_year = data.get("academic_year")
        if academic_year is None and self.instance is not None:
            academic_year = getattr(self.instance, "academic_year", None)

        if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
            raise serializers.ValidationError(
                {"academic_year": "No se pueden crear o modificar periodos en un año lectivo finalizado."}
            )

        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "La fecha de fin debe ser posterior a la fecha de inicio."}
            )

        # Validate that dates match the academic year
        if academic_year:
            if start_date and start_date.year != academic_year.year:
                raise serializers.ValidationError(
                    {"start_date": f"La fecha de inicio debe corresponder al año lectivo {academic_year.year}."}
                )
            if end_date and end_date.year != academic_year.year:
                raise serializers.ValidationError(
                    {"end_date": f"La fecha de fin debe corresponder al año lectivo {academic_year.year}."}
                )

        # Check for overlapping periods in the same academic year
        if academic_year and start_date and end_date:
            overlapping_periods = Period.objects.filter(
                academic_year=academic_year,
                start_date__lte=end_date,
                end_date__gte=start_date,
            )
            if self.instance:
                overlapping_periods = overlapping_periods.exclude(pk=self.instance.pk)

            if overlapping_periods.exists():
                raise serializers.ValidationError(
                    "El rango de fechas se solapa con otro periodo existente en este año lectivo."
                )

        return data


class AcademicLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicLevel
        fields = "__all__"


class GradeSerializer(serializers.ModelSerializer):
    level_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Grade
        fields = ["id", "name", "ordinal", "level", "level_name"]
        read_only_fields = ["id"]

    def get_level_name(self, obj):
        return obj.level.name if obj.level else None


class GroupSerializer(serializers.ModelSerializer):
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    director_name = serializers.SerializerMethodField()
    campus_name = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = "__all__"

    def get_enrolled_count(self, obj):
        # Count active enrollments
        return obj.enrollment_set.filter(status='ACTIVE').count()

    def get_director_name(self, obj):
        return obj.director.get_full_name() if obj.director else None

    def get_campus_name(self, obj):
        return obj.campus.name if obj.campus else None


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = "__all__"


class SubjectSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source="area.name", read_only=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True)

    class Meta:
        model = Subject
        fields = "__all__"


class TeacherAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.get_full_name", read_only=True)
    subject_name = serializers.CharField(source="academic_load.subject.name", read_only=True)
    area_name = serializers.CharField(source="academic_load.subject.area.name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    grade_name = serializers.CharField(source="group.grade.name", read_only=True)
    academic_year_year = serializers.IntegerField(source="academic_year.year", read_only=True)
    hours_per_week = serializers.IntegerField(source="academic_load.hours_per_week", read_only=True, allow_null=True)

    class Meta:
        model = TeacherAssignment
        fields = "__all__"
        validators = [
            serializers.UniqueTogetherValidator(
                queryset=TeacherAssignment.objects.all(),
                fields=['academic_load', 'group', 'academic_year'],
                message='Esta asignatura ya tiene un docente asignado en este grupo para el año seleccionado.'
            )
        ]

    def validate(self, attrs):
        academic_year = attrs.get("academic_year")
        group = attrs.get("group")

        if academic_year is None and self.instance is not None:
            academic_year = getattr(self.instance, "academic_year", None)

        if group is None and self.instance is not None:
            group = getattr(self.instance, "group", None)

        if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
            raise serializers.ValidationError(
                {"academic_year": "No se pueden agregar o modificar asignaciones en un año lectivo finalizado."}
            )

        if academic_year is not None and group is not None:
            if getattr(group, "academic_year_id", None) != getattr(academic_year, "id", None):
                raise serializers.ValidationError(
                    {"group": "El grupo seleccionado no corresponde al año lectivo seleccionado."}
                )

        return attrs


class EvaluationScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvaluationScale
        fields = "__all__"


class EvaluationComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvaluationComponent
        fields = "__all__"


class AssessmentSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)

    class Meta:
        model = Assessment
        fields = "__all__"


class StudentGradeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student.user.get_full_name", read_only=True
    )

    class Meta:
        model = StudentGrade
        fields = "__all__"


class EditRequestItemSerializer(serializers.ModelSerializer):
    enrollment_id = serializers.IntegerField(source="enrollment.id", read_only=True)

    class Meta:
        model = EditRequestItem
        fields = ["id", "enrollment_id"]


class EditRequestSerializer(serializers.ModelSerializer):
    requested_by = serializers.PrimaryKeyRelatedField(read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.get_full_name", read_only=True)

    items = EditRequestItemSerializer(many=True, read_only=True)
    enrollment_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
        help_text="Solo para solicitudes parciales: lista de enrollment_id.",
    )

    class Meta:
        model = EditRequest
        fields = "__all__"
        read_only_fields = [
            "id",
            "requested_by",
            "status",
            "decided_by",
            "decided_at",
            "decision_note",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request is not None else None

        scope = attrs.get("scope")
        request_type = attrs.get("request_type")
        period = attrs.get("period")
        teacher_assignment = attrs.get("teacher_assignment")
        enrollment_ids = attrs.get("enrollment_ids")

        if scope == EditRequest.SCOPE_GRADES and teacher_assignment is None:
            raise serializers.ValidationError({"teacher_assignment": "Es requerido para solicitudes de notas."})

        if scope == EditRequest.SCOPE_GRADES and period is not None and teacher_assignment is not None:
            if getattr(period, "academic_year_id", None) != getattr(teacher_assignment, "academic_year_id", None):
                raise serializers.ValidationError(
                    {"period": "El periodo no corresponde al año lectivo de la asignación."}
                )

        if request_type == EditRequest.TYPE_PARTIAL:
            if not enrollment_ids:
                raise serializers.ValidationError({"enrollment_ids": "Debes seleccionar al menos un estudiante."})
        else:
            # FULL: ignore any provided list
            if enrollment_ids:
                attrs["enrollment_ids"] = []

        # Teacher-only creation expected
        if user is not None and getattr(user, "role", None) == "TEACHER":
            if attrs.get("requested_by") is not None and attrs.get("requested_by") != user:
                raise serializers.ValidationError({"requested_by": "No puedes crear solicitudes para otro usuario."})

            if teacher_assignment is not None and getattr(teacher_assignment, "teacher_id", None) != getattr(user, "id", None):
                raise serializers.ValidationError({"teacher_assignment": "No tienes esta asignación."})

        return attrs

    def create(self, validated_data):
        enrollment_ids = validated_data.pop("enrollment_ids", [])

        request = self.context.get("request")
        user = getattr(request, "user", None) if request is not None else None

        if user is None:
            raise serializers.ValidationError({"detail": "No se pudo determinar el usuario solicitante."})

        # Always bind request to authenticated user (teachers create their own requests)
        validated_data["requested_by"] = user
        validated_data["status"] = EditRequest.STATUS_PENDING

        obj = super().create(validated_data)

        if obj.request_type == EditRequest.TYPE_PARTIAL and enrollment_ids:
            # Validate enrollments are in the right group/year for grade requests
            from students.models import Enrollment

            qs = Enrollment.objects.filter(id__in=set(enrollment_ids))
            if obj.scope == EditRequest.SCOPE_GRADES and obj.teacher_assignment_id:
                qs = qs.filter(
                    academic_year_id=obj.teacher_assignment.academic_year_id,
                    group_id=obj.teacher_assignment.group_id,
                )
            valid_ids = set(qs.values_list("id", flat=True))
            missing = sorted(set(enrollment_ids) - valid_ids)
            if missing:
                raise serializers.ValidationError(
                    {"enrollment_ids": f"Enrollments inválidos para esta solicitud: {missing}"}
                )

            EditRequestItem.objects.bulk_create(
                [EditRequestItem(request=obj, enrollment_id=eid) for eid in valid_ids]
            )

        return obj


class EditRequestDecisionSerializer(serializers.Serializer):
    valid_until = serializers.DateTimeField(required=False)
    decision_note = serializers.CharField(required=False, allow_blank=True)

    def validate_valid_until(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("La fecha debe ser futura.")
        return value


class EditGrantItemSerializer(serializers.ModelSerializer):
    enrollment_id = serializers.IntegerField(source="enrollment.id", read_only=True)

    class Meta:
        model = EditGrantItem
        fields = ["id", "enrollment_id", "created_at"]


class EditGrantSerializer(serializers.ModelSerializer):
    granted_to_name = serializers.CharField(source="granted_to.get_full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    items = EditGrantItemSerializer(many=True, read_only=True)

    class Meta:
        model = EditGrant
        fields = "__all__"


class AchievementDefinitionSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source="area.name", read_only=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    dimension_name = serializers.CharField(source="dimension.name", read_only=True)

    class Meta:
        model = AchievementDefinition
        fields = "__all__"
        read_only_fields = ["code"]

    def validate(self, attrs):
        request = self.context.get("request")

        # Keep existing values on update if not provided
        subject = attrs.get("subject")
        grade = attrs.get("grade")
        area = attrs.get("area")

        if getattr(self, "instance", None) is not None:
            if subject is None:
                subject = getattr(self.instance, "subject", None)
            if grade is None:
                grade = getattr(self.instance, "grade", None)
            if area is None:
                area = getattr(self.instance, "area", None)

        # Enforce subject-area consistency when both are provided
        if subject is not None and area is not None and getattr(subject, "area_id", None) != getattr(area, "id", None):
            raise serializers.ValidationError({"area": "El área no coincide con la asignatura seleccionada."})

        # Teacher restriction: a teacher can only create bank achievements for
        # subjects/grades they are assigned to (via AcademicLoad).
        if request is not None and getattr(request.user, "role", None) == "TEACHER":
            if subject is not None and grade is not None:
                allowed = TeacherAssignment.objects.filter(
                    teacher=request.user,
                    academic_load__subject=subject,
                    academic_load__grade=grade,
                ).exists()
                if not allowed:
                    raise serializers.ValidationError(
                        {"subject": "No tienes esta asignatura asignada para el grado seleccionado."}
                    )

        return attrs


class PerformanceIndicatorSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source='get_level_display', read_only=True)

    class Meta:
        model = PerformanceIndicator
        fields = "__all__"


class DimensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dimension
        fields = "__all__"


class AchievementSerializer(serializers.ModelSerializer):
    indicators = PerformanceIndicatorSerializer(many=True, required=False)
    definition_code = serializers.CharField(source="definition.code", read_only=True)
    dimension_name = serializers.CharField(source="dimension.name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = Achievement
        fields = "__all__"

    def validate(self, attrs):
        """Prevent 'empty' / inconsistent planned achievements.

        Frontend planning currently posts {period, subject, group, ...} and historically omitted
        academic_load. Gradebook is keyed by teacher_assignment.academic_load, so we infer it.
        """

        # Disallow whitespace-only descriptions (DRF allows "   ")
        if "description" in attrs and not (attrs.get("description") or "").strip():
            raise serializers.ValidationError({"description": "La descripción no puede estar vacía."})

        group = attrs.get("group")
        period = attrs.get("period")
        subject = attrs.get("subject")
        academic_load = attrs.get("academic_load")

        request = self.context.get("request")

        # Keep existing academic_load on update if not provided
        if not academic_load and getattr(self, "instance", None) is not None:
            academic_load = getattr(self.instance, "academic_load", None)

        # Infer academic_load on create when omitted
        if not academic_load:
            if subject and group:
                from academic.models import AcademicLoad

                academic_load = AcademicLoad.objects.filter(
                    subject=subject,
                    grade=group.grade,
                ).first()
                if not academic_load:
                    raise serializers.ValidationError(
                        {
                            "academic_load": "No existe una carga académica para esa asignatura y grado del grupo."
                        }
                    )
                attrs["academic_load"] = academic_load
            else:
                raise serializers.ValidationError(
                    {
                        "academic_load": "academic_load es requerido (o enviar subject y group para inferirlo)."
                    }
                )

        # Consistency checks
        if group and period and period.academic_year_id != group.academic_year_id:
            raise serializers.ValidationError(
                {"period": "El periodo no corresponde al año lectivo del grupo."}
            )

        if group and academic_load and academic_load.grade_id != group.grade_id:
            raise serializers.ValidationError(
                {"academic_load": "La carga académica no corresponde al grado del grupo."}
            )

        if subject and academic_load and academic_load.subject_id != subject.id:
            raise serializers.ValidationError(
                {"subject": "La asignatura no corresponde a la carga académica."}
            )

        if request is not None and getattr(request.user, "role", None) == "TEACHER":
            effective_period = period
            if effective_period is None and getattr(self, "instance", None) is not None:
                effective_period = getattr(self.instance, "period", None)

            effective_group = group
            if effective_group is None and getattr(self, "instance", None) is not None:
                effective_group = getattr(self.instance, "group", None)

            effective_academic_load = academic_load
            if effective_academic_load is None and getattr(self, "instance", None) is not None:
                effective_academic_load = getattr(self.instance, "academic_load", None)

            if effective_period and effective_group and effective_academic_load:
                allowed = TeacherAssignment.objects.filter(
                    teacher=request.user,
                    group=effective_group,
                    academic_year=effective_period.academic_year,
                    academic_load=effective_academic_load,
                ).exists()
                if not allowed:
                    raise serializers.ValidationError(
                        "No tienes una asignación para crear/editar logros en este grupo/asignatura para el año lectivo del periodo."
                    )

        return attrs

    def create(self, validated_data):
        indicators_data = validated_data.pop('indicators', [])
        achievement = Achievement.objects.create(**validated_data)
        for ind_data in indicators_data:
            PerformanceIndicator.objects.create(achievement=achievement, **ind_data)
        return achievement


class GradeSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeSheet
        fields = "__all__"


class AchievementGradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AchievementGrade
        fields = "__all__"


class GradebookCellUpsertSerializer(serializers.Serializer):
    enrollment = serializers.IntegerField()
    achievement = serializers.IntegerField()
    score = serializers.DecimalField(
        max_digits=4,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    def validate_score(self, value):
        if value is None:
            return value
        if value < 1 or value > 5:
            raise serializers.ValidationError("La nota debe estar entre 1.00 y 5.00.")
        return value


class GradebookBulkUpsertSerializer(serializers.Serializer):
    teacher_assignment = serializers.IntegerField()
    period = serializers.IntegerField()
    grades = GradebookCellUpsertSerializer(many=True)

