from django.contrib import admin

from .models import ReportJob


@admin.register(ReportJob)
class ReportJobAdmin(admin.ModelAdmin):
	list_display = ("id", "report_type", "status", "created_by", "created_at", "started_at", "finished_at")
	list_filter = ("report_type", "status", "created_at")
	search_fields = ("id", "created_by__username", "created_by__email")

# Register your models here.
