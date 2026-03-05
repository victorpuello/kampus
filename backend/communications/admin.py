from django.contrib import admin
from .models import (
	EmailDelivery,
	EmailEvent,
	EmailPreference,
	EmailPreferenceAudit,
	EmailSuppression,
	EmailTemplate,
	WhatsAppContact,
	WhatsAppDelivery,
	WhatsAppEvent,
	WhatsAppInstitutionMetric,
	WhatsAppSettings,
	WhatsAppSuppression,
	WhatsAppTemplateMap,
)


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


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
	list_display = ("slug", "name", "template_type", "category", "is_active", "updated_at")
	search_fields = ("slug", "name", "description", "category")
	list_filter = ("template_type", "is_active", "updated_at")


@admin.register(WhatsAppContact)
class WhatsAppContactAdmin(admin.ModelAdmin):
	list_display = ("id", "user", "phone_number", "is_active", "updated_at")
	search_fields = ("phone_number", "user__username", "user__email")
	list_filter = ("is_active", "updated_at")


@admin.register(WhatsAppDelivery)
class WhatsAppDeliveryAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"recipient_phone",
		"category",
		"status",
		"provider",
		"provider_message_id",
		"sent_at",
		"created_at",
	)
	search_fields = ("recipient_phone", "provider_message_id", "idempotency_key", "error_code")
	list_filter = ("status", "category", "provider", "created_at")


@admin.register(WhatsAppSuppression)
class WhatsAppSuppressionAdmin(admin.ModelAdmin):
	list_display = ("phone_number", "reason", "provider", "source_event_id", "created_at")
	search_fields = ("phone_number", "source_event_id")
	list_filter = ("reason", "provider", "created_at")


@admin.register(WhatsAppEvent)
class WhatsAppEventAdmin(admin.ModelAdmin):
	list_display = (
		"id",
		"provider",
		"event_type",
		"recipient_phone",
		"provider_event_id",
		"provider_message_id",
		"processed_at",
	)
	search_fields = ("provider_event_id", "provider_message_id", "recipient_phone")
	list_filter = ("provider", "event_type", "processed_at")


@admin.register(WhatsAppTemplateMap)
class WhatsAppTemplateMapAdmin(admin.ModelAdmin):
	list_display = ("notification_type", "template_name", "language_code", "category", "is_active", "updated_at")
	search_fields = ("notification_type", "template_name")
	list_filter = ("category", "is_active", "updated_at")


@admin.register(WhatsAppInstitutionMetric)
class WhatsAppInstitutionMetricAdmin(admin.ModelAdmin):
	list_display = (
		"institution",
		"window_start",
		"window_end",
		"total",
		"sent",
		"delivered",
		"read",
		"failed",
		"suppressed",
		"success_rate",
	)
	search_fields = ("institution__name",)
	list_filter = ("window_start", "window_end")


@admin.register(WhatsAppSettings)
class WhatsAppSettingsAdmin(admin.ModelAdmin):
	list_display = (
		"environment",
		"enabled",
		"provider",
		"api_version",
		"send_mode",
		"updated_at",
	)
	search_fields = ("environment", "provider", "phone_number_id", "template_fallback_name")
	list_filter = ("environment", "enabled", "provider", "send_mode")
