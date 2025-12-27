from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
	list_display = ("created_at", "event_type", "actor", "object_type", "object_id", "ip_address")
	list_filter = ("event_type", "object_type")
	search_fields = ("actor__username", "object_type", "object_id", "path")
	readonly_fields = (
		"created_at",
		"actor",
		"event_type",
		"object_type",
		"object_id",
		"path",
		"method",
		"status_code",
		"ip_address",
		"user_agent",
		"metadata",
	)

	def has_add_permission(self, request):
		return False

	def has_change_permission(self, request, obj=None):
		return False
