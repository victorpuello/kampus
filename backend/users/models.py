from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


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
    must_change_password = models.BooleanField(default=False)

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


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(blank=True, null=True)
    requested_ip = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["expires_at"]),
            models.Index(fields=["used_at"]),
        ]

    @property
    def is_active(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])
