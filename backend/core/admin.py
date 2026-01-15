from django.contrib import admin
from .models import Institution, Campus

@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display = ('name', 'nit', 'dane_code', 'phone')
    search_fields = ('name', 'nit')

    fieldsets = (
        ("Información general", {
            "fields": (
                'name', 'dane_code', 'nit', 'address', 'phone', 'email', 'website', 'logo',
                'rector', 'secretary',
            )
        }),
        ("Membrete para reportes PDF", {
            "fields": (
                'pdf_letterhead_image',
                'pdf_rector_signature_image',
                'pdf_show_logo',
                'pdf_logo_height_px',
                'pdf_header_line1',
                'pdf_header_line2',
                'pdf_header_line3',
                'pdf_footer_text',
            )
        }),
        ("Certificados", {
            "fields": (
                'certificate_studies_price_cop',
            )
        }),
    )

@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ('name', 'institution', 'is_main', 'phone')
    list_filter = ('institution', 'is_main')
    search_fields = ('name', 'address')
