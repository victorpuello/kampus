from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "recipient", "type", "title", "created_at", "read_at")
    list_filter = ("type", "created_at", "read_at")
    search_fields = ("title", "body", "url", "recipient__username", "recipient__email")
    readonly_fields = ("created_at",)
