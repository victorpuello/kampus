from django.contrib import admin
from .models import Teacher

@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'specialty', 'phone')
    search_fields = ('user__first_name', 'user__last_name', 'document_number')
    list_filter = ('specialty',)
