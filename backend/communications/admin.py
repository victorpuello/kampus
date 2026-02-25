from django.contrib import admin
from .models import EmailDelivery, EmailEvent, EmailPreference, EmailPreferenceAudit, EmailSuppression


@admin.register(EmailDelivery)
class EmailDeliveryAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"recipient_email",
		"subject",
		"category",
		"status",
		"provider",
		"sent_at",
		"created_at",
	)
	search_fields = ("recipient_email", "subject", "idempotency_key", "provider_message_id")
	list_filter = ("status", "category", "provider", "created_at")


@admin.register(EmailSuppression)
class EmailSuppressionAdmin(admin.ModelAdmin):
	list_display = ("email", "reason", "provider", "failure_count", "source_event_id", "created_at")
	search_fields = ("email", "source_event_id")
	list_filter = ("reason", "provider", "created_at")


@admin.register(EmailEvent)
class EmailEventAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"provider",
		"event_type",
		"recipient_email",
		"provider_event_id",
		"provider_message_id",
		"processed_at",
	)
	search_fields = ("provider_event_id", "provider_message_id", "recipient_email")
	list_filter = ("provider", "event_type", "processed_at")


@admin.register(EmailPreference)
class EmailPreferenceAdmin(admin.ModelAdmin):
	list_display = ("email", "user", "marketing_opt_in", "updated_at", "created_at")
	search_fields = ("email", "user__username", "user__email")
	list_filter = ("marketing_opt_in", "created_at")


@admin.register(EmailPreferenceAudit)
class EmailPreferenceAuditAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"preference",
		"previous_marketing_opt_in",
		"new_marketing_opt_in",
		"source",
		"created_at",
	)
	search_fields = ("preference__email", "notes")
	list_filter = ("source", "created_at")
