from django.contrib import admin

from .models import (
	DisciplineCase,
	DisciplineCaseAttachment,
	DisciplineCaseDecisionSuggestion,
	DisciplineCaseEvent,
	DisciplineCaseParticipant,
	ManualConvivencia,
	ManualConvivenciaChunk,
)


@admin.register(DisciplineCase)
class DisciplineCaseAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"student",
		"enrollment",
		"occurred_at",
		"manual_severity",
		"law_1620_type",
		"status",
	)
	list_filter = ("status", "manual_severity", "law_1620_type")
	search_fields = (
		"student__user__first_name",
		"student__user__last_name",
		"student__document_number",
		"narrative",
	)


@admin.register(DisciplineCaseParticipant)
class DisciplineCaseParticipantAdmin(admin.ModelAdmin):
	list_display = ("id", "case", "student", "role")
	list_filter = ("role",)


@admin.register(DisciplineCaseAttachment)
class DisciplineCaseAttachmentAdmin(admin.ModelAdmin):
	list_display = ("id", "case", "kind", "uploaded_at", "uploaded_by")
	list_filter = ("kind",)


@admin.register(DisciplineCaseEvent)
class DisciplineCaseEventAdmin(admin.ModelAdmin):
	list_display = ("id", "case", "event_type", "created_at", "created_by")
	list_filter = ("event_type",)


@admin.register(ManualConvivencia)
class ManualConvivenciaAdmin(admin.ModelAdmin):
	list_display = ("id", "institution", "title", "version", "is_active", "extraction_status", "uploaded_at")
	list_filter = ("institution", "is_active", "extraction_status")
	search_fields = ("title", "version")


@admin.register(ManualConvivenciaChunk)
class ManualConvivenciaChunkAdmin(admin.ModelAdmin):
	list_display = ("id", "manual", "index", "label")
	list_filter = ("manual",)
	search_fields = ("label", "text")


@admin.register(DisciplineCaseDecisionSuggestion)
class DisciplineCaseDecisionSuggestionAdmin(admin.ModelAdmin):
	list_display = ("id", "case", "status", "manual", "created_by", "created_at", "approved_by", "approved_at")
	list_filter = ("status", "manual")
	search_fields = ("suggested_decision_text", "reasoning")

# Register your models here.
