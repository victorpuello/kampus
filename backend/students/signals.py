from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Enrollment


@receiver(post_save, sender=Enrollment)
def deactivate_user_when_graduated(sender, instance: Enrollment, created: bool, **kwargs):
    # If an enrollment is marked as GRADUATED, the student should not remain active.
    # Safety: only deactivate if the student has no ACTIVE enrollments.
    try:
        if (instance.status or "").upper() != "GRADUATED":
            return

        student = instance.student
        if student.enrollment_set.filter(status="ACTIVE").exists():
            return

        user = student.user
        if getattr(user, "is_active", True):
            user.is_active = False
            user.save(update_fields=["is_active"])
    except Exception:
        # Best-effort: never break writes due to signal issues.
        return
