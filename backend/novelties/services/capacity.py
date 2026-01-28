from __future__ import annotations

from django.db.models import Q

from academic.models import Group
from students.models import Enrollment

from ..models import CapacityBucket, GroupCapacityOverride


def _get_bucket_for_group(group: Group) -> CapacityBucket | None:
    try:
        campus_id = group.campus_id
        grade_id = group.grade_id
        year_id = group.academic_year_id
        shift = getattr(group, "shift", "") or ""
        if not (campus_id and grade_id and year_id and shift):
            return None

        return (
            CapacityBucket.objects.filter(
                campus_id=campus_id,
                grade_id=grade_id,
                academic_year_id=year_id,
                shift=shift,
                is_active=True,
            )
            .order_by("-updated_at")
            .first()
        )
    except Exception:
        return None


def _get_override_for_group(group: Group) -> GroupCapacityOverride | None:
    try:
        return GroupCapacityOverride.objects.filter(group=group, is_active=True).first()
    except Exception:
        return None


def get_effective_group_capacity(group: Group) -> int:
    """Return the effective capacity for a group.

    Policy:
    - If there is a GroupCapacityOverride and/or a CapacityBucket, apply the most restrictive.
    - Always keep Group.capacity as an upper bound (to preserve legacy semantics).
    - If nothing is configured, falls back to Group.capacity.
    """

    caps: list[int] = []
    base = int(getattr(group, "capacity", 0) or 0)
    caps.append(base)

    override = _get_override_for_group(group)
    if override is not None:
        caps.append(int(override.capacity or 0))

    bucket = _get_bucket_for_group(group)
    if bucket is not None:
        caps.append(int(bucket.capacity or 0))

    return min(caps) if caps else 0


def capacity_lock_keys_for_group(group: Group) -> list[str]:
    keys: list[str] = []
    if getattr(group, "id", None):
        keys.append(f"novelties:cap:group:{group.id}")

    bucket = _get_bucket_for_group(group)
    if bucket is not None:
        keys.append(f"novelties:cap:bucket:{bucket.campus_id}:{bucket.grade_id}:{bucket.academic_year_id}:{bucket.shift}:{bucket.modality}")

    return keys


def lock_rows_for_group_capacity(group: Group) -> None:
    """Row-level locks inside a transaction (Postgres). No-op on SQLite."""

    bucket = _get_bucket_for_group(group)
    if bucket is not None:
        CapacityBucket.objects.select_for_update().filter(pk=bucket.pk).exists()

    override = _get_override_for_group(group)
    if override is not None:
        GroupCapacityOverride.objects.select_for_update().filter(pk=override.pk).exists()


def count_active_enrollments(group: Group) -> int:
    return Enrollment.objects.filter(group=group, status="ACTIVE").count()


def assert_capacity_available(*, group: Group, exclude_enrollment_id: int | None = None) -> None:
    qs = Enrollment.objects.filter(group=group, status="ACTIVE")
    if exclude_enrollment_id is not None:
        qs = qs.exclude(id=exclude_enrollment_id)

    current = qs.count()
    cap = get_effective_group_capacity(group)
    if current >= cap:
        raise ValueError(f"El grupo ha alcanzado su capacidad máxima ({cap}).")
