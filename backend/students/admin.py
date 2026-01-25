from django.contrib import admin
from .models import Student, FamilyMember, Enrollment, StudentNovelty, StudentDocument

@admin.register(StudentDocument)
class StudentDocumentAdmin(admin.ModelAdmin):
    list_display = ('student', 'document_type', 'uploaded_at')
    list_filter = ('document_type', 'uploaded_at')
    search_fields = ('student__user__first_name', 'student__user__last_name')

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('user', 'document_number', 'grade_info', 'status_info')
    search_fields = ('user__first_name', 'user__last_name', 'document_number')
    
    def grade_info(self, obj):
        enrollment = obj.enrollment_set.filter(status='ACTIVE').first()
        return f"{enrollment.grade} - {enrollment.academic_year}" if enrollment else "Sin matrícula activa"
    grade_info.short_description = "Grado Actual"

    def status_info(self, obj):
        return "ACTIVO" if obj.user.is_active else "INACTIVO"
    status_info.short_description = "Estado"

@admin.register(FamilyMember)
class FamilyMemberAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'student', 'relationship', 'document_number', 'identity_document', 'phone', 'is_main_guardian')
    search_fields = ('full_name', 'student__user__first_name', 'student__user__last_name')
    list_filter = ('relationship', 'is_main_guardian')

@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'grade', 'group', 'campus', 'academic_year', 'status')
    list_filter = ('academic_year', 'grade', 'campus', 'status')
    search_fields = ('student__user__first_name', 'student__user__last_name')

@admin.register(StudentNovelty)
class StudentNoveltyAdmin(admin.ModelAdmin):
    list_display = ('student', 'novelty_type', 'date', 'created_at')
    list_filter = ('novelty_type', 'date')
    search_fields = ('student__user__first_name', 'student__user__last_name', 'observation')
