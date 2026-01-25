from __future__ import annotations

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from academic.models import GradeSheet


logger = logging.getLogger(__name__)


@receiver(pre_save, sender=GradeSheet)
def _gradesheet_pre_save(sender, instance: GradeSheet, **kwargs):
    if not instance.pk:
        instance._old_status = None  # type: ignore[attr-defined]
        return

    try:
        old_status = GradeSheet.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    except Exception:
        old_status = None

    instance._old_status = old_status  # type: ignore[attr-defined]


@receiver(post_save, sender=GradeSheet)
def _gradesheet_post_save(sender, instance: GradeSheet, created: bool, **kwargs):
    try:
        old_status = getattr(instance, "_old_status", None)

        became_published = instance.status == GradeSheet.STATUS_PUBLISHED and (
            created or (old_status is not None and old_status != instance.status)
        )

        if not became_published:
            return

        if instance.published_at is None:
            GradeSheet.objects.filter(pk=instance.pk, published_at__isnull=True).update(published_at=timezone.now())

        from students.services.observer_annotations import maybe_generate_group_period_annotations

        maybe_generate_group_period_annotations(gradesheet_id=int(instance.pk))
    except Exception:
        logger.exception("Error handling GradeSheet publish automation")
