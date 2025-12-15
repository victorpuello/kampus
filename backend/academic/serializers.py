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
)


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
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        academic_year = data.get("academic_year")

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
        fields = ["id", "name", "level", "level_name"]
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
    group_name = serializers.CharField(source="group.name", read_only=True)

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


class AchievementDefinitionSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source="area.name", read_only=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    dimension_name = serializers.CharField(source="dimension.name", read_only=True)

    class Meta:
        model = AchievementDefinition
        fields = "__all__"
        read_only_fields = ["code"]


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

