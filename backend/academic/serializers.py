from rest_framework import serializers

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


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "year"]
        read_only_fields = ["id"]


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
    level_name = serializers.CharField(source="level.name", read_only=True)
    
    class Meta:
        model = Grade
        fields = ["id", "name", "level", "level_name"]
        read_only_fields = ["id"]


class GroupSerializer(serializers.ModelSerializer):
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    director_name = serializers.CharField(
        source="director.get_full_name", read_only=True
    )
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = Group
        fields = "__all__"


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
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = TeacherAssignment
        fields = "__all__"


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


class AchievementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = "__all__"

