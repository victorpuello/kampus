from rest_framework import serializers

from .models import (
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


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ["id", "name"]
        read_only_fields = ["id"]


class GroupSerializer(serializers.ModelSerializer):
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    director_name = serializers.CharField(
        source="director.get_full_name", read_only=True
    )

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

