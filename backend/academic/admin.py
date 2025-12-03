from django.contrib import admin

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


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("year",)


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ("name", "academic_year", "start_date", "end_date", "is_closed")
    list_filter = ("academic_year", "is_closed")


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("name",)


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "grade", "academic_year", "director")
    list_filter = ("academic_year", "grade")


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "grade", "weight_percentage", "hours_per_week")
    list_filter = ("area", "grade")


@admin.register(TeacherAssignment)
class TeacherAssignmentAdmin(admin.ModelAdmin):
    list_display = ("teacher", "subject", "group", "academic_year")
    list_filter = ("academic_year", "group", "subject")


@admin.register(EvaluationScale)
class EvaluationScaleAdmin(admin.ModelAdmin):
    list_display = ("name", "min_score", "max_score", "academic_year")
    list_filter = ("academic_year",)


@admin.register(EvaluationComponent)
class EvaluationComponentAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "weight_percentage")
    list_filter = ("subject",)


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ("name", "component", "period", "date", "weight_percentage")
    list_filter = ("period", "component__subject")


@admin.register(StudentGrade)
class StudentGradeAdmin(admin.ModelAdmin):
    list_display = ("student", "assessment", "score")
    list_filter = ("assessment__period", "assessment__component__subject")


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("description", "subject", "period")
    list_filter = ("period", "subject")

