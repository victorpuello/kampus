from django.contrib import admin

from .models import Notification, NotificationDispatch, NotificationType


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "recipient", "type", "title", "created_at", "read_at")
    list_filter = ("type", "created_at", "read_at")
    search_fields = ("title", "body", "url", "recipient__username", "recipient__email")
    readonly_fields = ("created_at",)


@admin.register(NotificationDispatch)
class NotificationDispatchAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "notification",
        "channel",
        "status",
        "attempts",
        "next_retry_at",
        "created_at",
        "processed_at",
    )
    list_filter = ("channel", "status", "created_at")
    search_fields = ("idempotency_key", "error_message", "notification__title")
    readonly_fields = ("created_at", "updated_at", "processed_at")


@admin.register(NotificationType)
class NotificationTypeAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "email_enabled",
        "whatsapp_enabled",
        "whatsapp_requires_template",
        "is_active",
        "updated_at",
    )
    list_filter = ("email_enabled", "whatsapp_enabled", "whatsapp_requires_template", "is_active")
    search_fields = ("code", "description")
