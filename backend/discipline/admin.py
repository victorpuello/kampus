from django.contrib import admin

from .models import (
	DisciplineCase,
	DisciplineCaseAttachment,
	DisciplineCaseEvent,
	DisciplineCaseParticipant,
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

# Register your models here.
