from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_SUPERADMIN = "SUPERADMIN"
    ROLE_ADMIN = "ADMIN"
    ROLE_COORDINATOR = "COORDINATOR"
    ROLE_SECRETARY = "SECRETARY"
    ROLE_TEACHER = "TEACHER"
    ROLE_PARENT = "PARENT"
    ROLE_STUDENT = "STUDENT"

    ROLES = (
        (ROLE_SUPERADMIN, "Superadministrador"),
        (ROLE_ADMIN, "Administrador/Rector"),
        (ROLE_COORDINATOR, "Coordinador"),
        (ROLE_SECRETARY, "Secretaría"),
        (ROLE_TEACHER, "Docente"),
        (ROLE_PARENT, "Padre de Familia"),
        (ROLE_STUDENT, "Estudiante"),
    )

    role = models.CharField(max_length=20, choices=ROLES)
    email = models.EmailField(unique=True, blank=True, null=True, verbose_name="Correo electrónico")

    REQUIRED_FIELDS = ["email", "role"]

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"
