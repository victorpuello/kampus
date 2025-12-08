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
    document_number = models.CharField(max_length=50, blank=True, unique=True, verbose_name="Número de documento")
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)

    # Professional Info
    title = models.CharField(
        max_length=200, blank=True, verbose_name="Título Profesional"
    )
    specialty = models.CharField(max_length=200, blank=True, verbose_name="Especialidad")

    REGIME_2277 = '2277'
    REGIME_1278 = '1278'
    REGIME_CHOICES = [
        (REGIME_2277, 'Estatuto 2277 de 1979 (Antiguo)'),
        (REGIME_1278, 'Estatuto 1278 de 2002 (Nuevo)'),
    ]

    SCALE_CHOICES = [
        # Estatuto 2277 (Grados 1-14)
        ('1', 'Grado 1'), ('2', 'Grado 2'), ('3', 'Grado 3'), ('4', 'Grado 4'),
        ('5', 'Grado 5'), ('6', 'Grado 6'), ('7', 'Grado 7'), ('8', 'Grado 8'),
        ('9', 'Grado 9'), ('10', 'Grado 10'), ('11', 'Grado 11'), ('12', 'Grado 12'),
        ('13', 'Grado 13'), ('14', 'Grado 14'),
        # Estatuto 1278 (Grados 1-3, Niveles A-D)
        ('1A', '1A'), ('1B', '1B'), ('1C', '1C'), ('1D', '1D'),
        ('2A', '2A'), ('2B', '2B'), ('2C', '2C'), ('2D', '2D'),
        ('3A', '3A'), ('3B', '3B'), ('3C', '3C'), ('3D', '3D'),
    ]

    regime = models.CharField(
        max_length=10,
        choices=REGIME_CHOICES,
        blank=True,
        null=True,
        verbose_name="Régimen"
    )
    salary_scale = models.CharField(
        max_length=10,
        choices=SCALE_CHOICES,
        blank=True,
        verbose_name="Escalafón"
    )

    hiring_date = models.DateField(
        null=True, blank=True, verbose_name="Fecha de Contratación"
    )

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.title}"
