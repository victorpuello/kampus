from django.contrib import admin
from .models import Institution, Campus

@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display = ('name', 'nit', 'dane_code', 'phone')
    search_fields = ('name', 'nit')

@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ('name', 'institution', 'is_main', 'phone')
    list_filter = ('institution', 'is_main')
    search_fields = ('name', 'address')
