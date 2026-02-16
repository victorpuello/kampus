from django.contrib import admin

from .models import (
    AcademicLevel,
    AcademicYear,
    AcademicLoad,
    Achievement,
    AchievementGrade,
    AchievementDefinition,
    Area,
    Assessment,
    Dimension,
    EvaluationComponent,
    EvaluationScale,
    Grade,
    GradeSheet,
    Group,
    PerformanceIndicator,
    Period,
    StudentGrade,
    Subject,
    TeacherAssignment,
    CommissionRuleConfig,
    Commission,
    CommissionStudentDecision,
    CommitmentActa,
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
    search_fields = ("name", "academic_year__year")


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
    list_display = (
        "name",
        "academic_year",
        "scale_type",
        "applies_to_level",
        "is_default",
        "order",
        "min_score",
        "max_score",
        "internal_numeric_value",
    )
    list_filter = ("academic_year", "scale_type", "applies_to_level", "is_default")


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
    list_display = ("student", "period", "subject", "group", "assessment", "score")
    list_filter = (
        "assessment__period",
        "assessment__period__academic_year",
        "assessment__component__academic_load__subject",
        "assessment__component__academic_load__grade",
    )
    search_fields = (
        "student__user__first_name",
        "student__user__last_name",
        "assessment__name",
        "assessment__component__academic_load__subject__name",
    )
    autocomplete_fields = ("student", "assessment")

    @admin.display(description="Periodo")
    def period(self, obj):
        return getattr(getattr(obj.assessment, "period", None), "name", None)

    @admin.display(description="Asignatura")
    def subject(self, obj):
        return getattr(getattr(getattr(obj.assessment, "component", None), "academic_load", None), "subject", None)

    @admin.display(description="Grupo")
    def group(self, obj):
        # Notas se relacionan a Assessment->component->academic_load (grado) y al estudiante.
        # El grupo exacto se refleja en GradeSheet/TeacherAssignment, por eso lo mostramos allí.
        return "—"


@admin.register(PerformanceIndicator)
class PerformanceIndicatorAdmin(admin.ModelAdmin):
    list_display = ("achievement", "level", "description")
    list_filter = ("level", "achievement__period")
    search_fields = ("description", "achievement__description")


@admin.register(AchievementDefinition)
class AchievementDefinitionAdmin(admin.ModelAdmin):
    list_display = ("code", "description_short", "dimension", "area", "grade", "subject", "academic_load", "is_active")
    list_filter = ("is_active", "dimension", "area", "grade", "subject", "academic_load")
    search_fields = ("code", "description")
    readonly_fields = ("code",)

    def description_short(self, obj):
        return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
    description_short.short_description = "Descripción"


class PerformanceIndicatorInline(admin.TabularInline):
    model = PerformanceIndicator
    extra = 1


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("description_short", "dimension", "subject", "group", "period", "percentage")
    list_filter = ("period", "dimension", "subject", "group", "academic_load__grade")
    search_fields = ("description", "subject__name", "group__name")
    inlines = [PerformanceIndicatorInline]

    def description_short(self, obj):
        return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
    description_short.short_description = "Descripción"


@admin.register(GradeSheet)
class GradeSheetAdmin(admin.ModelAdmin):
    list_display = ("teacher_assignment", "period", "status", "published_at", "created_at", "updated_at")
    list_filter = ("status", "period", "period__academic_year", "teacher_assignment__group")
    search_fields = (
        "teacher_assignment__teacher__first_name",
        "teacher_assignment__teacher__last_name",
        "teacher_assignment__group__name",
        "teacher_assignment__academic_load__subject__name",
    )
    autocomplete_fields = ("teacher_assignment", "period")


@admin.register(AchievementGrade)
class AchievementGradeAdmin(admin.ModelAdmin):
    list_display = ("gradesheet", "enrollment", "achievement", "score", "updated_at")
    list_filter = (
        "gradesheet__period",
        "gradesheet__period__academic_year",
        "gradesheet__teacher_assignment__group",
        "achievement__subject",
    )
    search_fields = (
        "enrollment__student__user__first_name",
        "enrollment__student__user__last_name",
        "enrollment__group__name",
        "achievement__description",
        "achievement__subject__name",
    )
    autocomplete_fields = ("gradesheet", "enrollment", "achievement")


@admin.register(Dimension)
class DimensionAdmin(admin.ModelAdmin):
    list_display = ("name", "percentage", "academic_year", "is_active")
    list_filter = ("academic_year", "is_active")
    search_fields = ("name",)


@admin.register(CommissionRuleConfig)
class CommissionRuleConfigAdmin(admin.ModelAdmin):
    list_display = (
        "academic_year",
        "institution",
        "subjects_threshold",
        "areas_threshold",
        "operator",
        "is_active",
    )
    list_filter = ("academic_year", "institution", "operator", "is_active")


@admin.register(Commission)
class CommissionAdmin(admin.ModelAdmin):
    list_display = (
        "commission_type",
        "status",
        "academic_year",
        "period",
        "group",
        "created_by",
        "created_at",
    )
    list_filter = ("commission_type", "status", "academic_year", "period", "group")
    search_fields = ("title", "notes")


@admin.register(CommissionStudentDecision)
class CommissionStudentDecisionAdmin(admin.ModelAdmin):
    list_display = (
        "commission",
        "enrollment",
        "failed_subjects_count",
        "failed_areas_count",
        "is_flagged",
        "decision",
        "decided_by",
    )
    list_filter = ("commission", "is_flagged", "decision")
    search_fields = (
        "enrollment__student__user__first_name",
        "enrollment__student__user__last_name",
        "enrollment__student__document_number",
    )


@admin.register(CommitmentActa)
class CommitmentActaAdmin(admin.ModelAdmin):
    list_display = (
        "decision",
        "student_name",
        "guardian_name",
        "director_name",
        "generated_by",
        "generated_at",
    )
    search_fields = ("student_name", "guardian_name", "director_name", "title")

