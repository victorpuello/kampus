from __future__ import annotations

from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.db.models import Q

from academic.models import Group
from core.models import Campus, Institution
from students.models import Enrollment, FamilyMember


User = get_user_model()


def resolve_institution_for_user(user: Any) -> Optional[Institution]:
    if user is None:
        return None

    institution = (
        Institution.objects.filter(Q(rector=user) | Q(secretary=user)).order_by("id").first()
    )
    if institution is not None:
        return institution

    campus = (
        Campus.objects.select_related("institution")
        .filter(Q(director=user) | Q(campus_secretary=user) | Q(coordinator=user))
        .order_by("id")
        .first()
    )
    if campus is not None and campus.institution_id:
        return campus.institution

    group = (
        Group.objects.select_related("campus__institution")
        .filter(director=user)
        .exclude(campus__institution_id__isnull=True)
        .order_by("id")
        .first()
    )
    if group is not None and group.campus and group.campus.institution_id:
        return group.campus.institution

    enrollment = (
        Enrollment.objects.select_related("campus__institution")
        .filter(student__user=user, status="ACTIVE")
        .exclude(campus__institution_id__isnull=True)
        .order_by("id")
        .first()
    )
    if enrollment is not None and enrollment.campus and enrollment.campus.institution_id:
        return enrollment.campus.institution

    family_member = FamilyMember.objects.filter(user=user).order_by("id").first()
    if family_member is not None:
        enrollment = (
            Enrollment.objects.select_related("campus__institution")
            .filter(student=family_member.student, status="ACTIVE")
            .exclude(campus__institution_id__isnull=True)
            .order_by("id")
            .first()
        )
        if enrollment is not None and enrollment.campus and enrollment.campus.institution_id:
            return enrollment.campus.institution

    return Institution.objects.order_by("id").first()
