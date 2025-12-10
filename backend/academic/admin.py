from django.contrib import admin

from .models import (
    AcademicLevel,
    AcademicYear,
    AcademicLoad,
    Achievement,
    AchievementDefinition,
    Area,
    Assessment,
    EvaluationComponent,
    EvaluationScale,
    Grade,
    Group,
    PerformanceIndicator,
    Period,
    StudentGrade,
    Subject,
    TeacherAssignment,
)


@admin.register(AcademicLevel)
class AcademicLevelAdmin(admin.ModelAdmin):
    list_display = ("name", "level_type", "min_age", "max_age")
    list_filter = ("level_type",)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("year", "status", "start_date", "end_date")
    list_filter = ("status",)


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ("name", "academic_year", "start_date", "end_date", "is_closed")
    list_filter = ("academic_year", "is_closed")


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("name", "level")
    list_filter = ("level",)


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "grade", "campus", "academic_year", "director", "shift", "capacity")
    list_filter = ("academic_year", "grade", "campus", "shift")
    search_fields = ("name", "director__first_name", "director__last_name")


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "area")
    list_filter = ("area",)
    search_fields = ("name",)


@admin.register(AcademicLoad)
class AcademicLoadAdmin(admin.ModelAdmin):
    list_display = ("subject", "grade", "weight_percentage", "hours_per_week")
    list_filter = ("subject__area", "grade")
    search_fields = ("subject__name",)


@admin.register(TeacherAssignment)
class TeacherAssignmentAdmin(admin.ModelAdmin):
    list_display = ("teacher", "academic_load", "group", "academic_year")
    list_filter = ("academic_year", "group", "academic_load__subject")
    search_fields = ("teacher__first_name", "teacher__last_name", "academic_load__subject__name", "group__name")


@admin.register(EvaluationScale)
class EvaluationScaleAdmin(admin.ModelAdmin):
    list_display = ("name", "min_score", "max_score", "academic_year", "scale_type")
    list_filter = ("academic_year", "scale_type")


@admin.register(EvaluationComponent)
class EvaluationComponentAdmin(admin.ModelAdmin):
    list_display = ("name", "academic_load", "weight_percentage")
    list_filter = ("academic_load__grade", "academic_load__subject__area")
    search_fields = ("name", "academic_load__subject__name")


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ("name", "component", "period", "date", "weight_percentage")
    list_filter = ("period", "component__academic_load__subject")
    search_fields = ("name",)


@admin.register(StudentGrade)
class StudentGradeAdmin(admin.ModelAdmin):
    list_display = ("student", "assessment", "score")
    list_filter = ("assessment__period", "assessment__component__academic_load__subject")
    search_fields = ("student__user__first_name", "student__user__last_name", "assessment__name")


class PerformanceIndicatorInline(admin.TabularInline):
    model = PerformanceIndicator
    extra = 1


@admin.register(AchievementDefinition)
class AchievementDefinitionAdmin(admin.ModelAdmin):
    list_display = ("code", "description_short", "area", "grade", "subject", "academic_load", "is_active")
    list_filter = ("is_active", "area", "grade", "subject", "academic_load")
    search_fields = ("code", "description")
    readonly_fields = ("code",)

    def description_short(self, obj):
        return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
    description_short.short_description = "Descripción"


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("description_short", "academic_load", "period", "percentage")
    list_filter = ("period", "academic_load__grade", "academic_load__subject__area")
    search_fields = ("description", "academic_load__subject__name")
    inlines = [PerformanceIndicatorInline]

    def description_short(self, obj):
        return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
    description_short.short_description = "Descripción"

