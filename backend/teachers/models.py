from django.conf import settings
from django.db import models


class Teacher(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="teacher_profile",
    )
    document_type = models.CharField(max_length=20, blank=True)
    document_number = models.CharField(max_length=50, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)

    # Professional Info
    title = models.CharField(
        max_length=200, blank=True, verbose_name="Título Profesional"
    )
    specialty = models.CharField(max_length=200, blank=True, verbose_name="Especialidad")
    salary_scale = models.CharField(max_length=50, blank=True, verbose_name="Escalafón")
    hiring_date = models.DateField(
        null=True, blank=True, verbose_name="Fecha de Contratación"
    )

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.title}"
