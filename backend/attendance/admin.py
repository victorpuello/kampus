from django.contrib import admin

from .models import AttendanceRecord, AttendanceSession


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "teacher_assignment", "period", "class_date", "sequence", "starts_at", "locked_at")
    list_filter = ("period", "class_date", "locked_at")
    search_fields = ("teacher_assignment__teacher__username", "teacher_assignment__group__name")


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "enrollment", "status", "tardy_at", "marked_at")
    list_filter = ("status",)
    search_fields = ("enrollment__student__user__first_name", "enrollment__student__user__last_name")
