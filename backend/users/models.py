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

    ROLE_GROUP_NAMES = [
        ROLE_SUPERADMIN,
        ROLE_ADMIN,
        ROLE_COORDINATOR,
        ROLE_SECRETARY,
        ROLE_TEACHER,
        ROLE_PARENT,
        ROLE_STUDENT,
    ]

    def sync_role_group(self) -> None:
        """Ensures the user belongs to the group matching their `role`.

        `User.role` is the source of truth. Other non-role groups are preserved.
        """

        role = getattr(self, "role", None)
        if not role:
            return

        from django.contrib.auth.models import Group

        role_group, _ = Group.objects.get_or_create(name=role)

        # Remove other role groups (keep any non-role groups intact)
        other_role_groups = list(
            Group.objects.filter(name__in=self.ROLE_GROUP_NAMES).exclude(name=role)
        )
        if other_role_groups:
            self.groups.remove(*other_role_groups)

        if not self.groups.filter(name=role).exists():
            self.groups.add(role_group)

    def save(self, *args, **kwargs):
        if self.email == "":
            self.email = None
        super().save(*args, **kwargs)
        # Keep group membership consistent with role.
        # Safe to call repeatedly; uses idempotent operations.
        try:
            self.sync_role_group()
        except Exception:
            # Avoid breaking core user save flows if group tables aren't ready yet.
            pass

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"

    def get_full_name(self) -> str:
        """Return the person's full name in 'Apellidos Nombre' format.

        This keeps UI lists consistent in Spanish contexts.
        """

        last_name = (self.last_name or "").strip()
        first_name = (self.first_name or "").strip()
        full_name = f"{last_name} {first_name}".strip()
        return full_name or (self.username or "")
