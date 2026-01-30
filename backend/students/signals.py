from __future__ import annotations

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Enrollment, FamilyMember, Student, StudentDocument

from students.completion import invalidate_completion_cache_for_student


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


@receiver(post_save, sender=Enrollment)
@receiver(post_delete, sender=Enrollment)
def invalidate_completion_cache_on_enrollment_change(sender, instance: Enrollment, **kwargs):
    try:
        invalidate_completion_cache_for_student(int(getattr(instance, "student_id", 0) or 0))
    except Exception:
        return


@receiver(post_save, sender=Student)
def invalidate_completion_cache_on_student_change(sender, instance: Student, **kwargs):
    try:
        invalidate_completion_cache_for_student(int(getattr(instance, "pk", 0) or 0))
    except Exception:
        return


@receiver(post_save, sender=FamilyMember)
@receiver(post_delete, sender=FamilyMember)
def invalidate_completion_cache_on_family_change(sender, instance: FamilyMember, **kwargs):
    try:
        invalidate_completion_cache_for_student(int(getattr(instance, "student_id", 0) or 0))
    except Exception:
        return


@receiver(post_save, sender=StudentDocument)
@receiver(post_delete, sender=StudentDocument)
def invalidate_completion_cache_on_document_change(sender, instance: StudentDocument, **kwargs):
    try:
        invalidate_completion_cache_for_student(int(getattr(instance, "student_id", 0) or 0))
    except Exception:
        return
