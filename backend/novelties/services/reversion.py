from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from students.models import Enrollment

from ..models import NoveltyCase, NoveltyCaseTransition, NoveltyReversion


def _apply_snapshot(case: NoveltyCase, snapshot: dict) -> None:
    student = case.student
    user = student.user

    # Restore user.is_active
    try:
        user_active = bool(snapshot.get("student", {}).get("user_is_active", True))
        if getattr(user, "is_active", True) != user_active:
            user.is_active = user_active
            user.save(update_fields=["is_active"])
    except Exception:
        pass

    enrollments_before = snapshot.get("student", {}).get("enrollments", []) or []
    before_by_id = {int(e["id"]): e for e in enrollments_before if e and e.get("id") is not None}

    # Lock student enrollments
    qs = Enrollment.objects.select_for_update().filter(student=student)
    current = list(qs)
    current_ids = {e.id for e in current}
    before_ids = set(before_by_id.keys())

    # Restore fields for enrollments that existed before.
    for e in current:
        if e.id not in before_ids:
            continue
        data = before_by_id[e.id]
        e.academic_year_id = data.get("academic_year_id")
        e.grade_id = data.get("grade_id")
        e.group_id = data.get("group_id")
        e.campus_id = data.get("campus_id")
        e.status = data.get("status")
        e.origin_school = data.get("origin_school") or ""
        e.final_status = data.get("final_status") or ""
        e.enrolled_at = data.get("enrolled_at")
        e.save(
            update_fields=[
                "academic_year",
                "grade",
                "group",
                "campus",
                "status",
                "origin_school",
                "final_status",
                "enrolled_at",
            ]
        )

    # For enrollments created after execution: avoid hard delete; just retire if active.
    created_ids = current_ids - before_ids
    if created_ids:
        Enrollment.objects.filter(id__in=created_ids, status="ACTIVE").update(status="RETIRED")


def revert_case(*, case_id: int, actor, comment: str, ip_address: str | None) -> NoveltyReversion:
    with transaction.atomic():
        case = (
            NoveltyCase.objects.select_for_update()
            .select_related("student__user", "novelty_type")
            .get(pk=case_id)
        )

        if case.status != NoveltyCase.Status.EXECUTED:
            raise ValueError("Solo se puede revertir un caso en estado EJECUTADO")

        if hasattr(case, "reversion"):
            return case.reversion

        try:
            execution = case.execution
        except Exception:
            raise ValueError("No existe ejecución registrada para revertir")

        before = {
            "case": {
                "case_id": case.id,
                "status": case.status,
                "executed_at": case.executed_at.isoformat() if case.executed_at else None,
            },
            "student": execution.after_snapshot.get("student", {}),
        }

        # Apply the original BEFORE snapshot (restore).
        _apply_snapshot(case, execution.before_snapshot or {})

        case.status = NoveltyCase.Status.REVERTED
        case.save(update_fields=["status", "updated_at"])

        actor_role = getattr(actor, "role", "") if actor and getattr(actor, "is_authenticated", False) else ""
        NoveltyCaseTransition.objects.create(
            case=case,
            from_status=NoveltyCase.Status.EXECUTED,
            to_status=NoveltyCase.Status.REVERTED,
            actor=actor if actor and getattr(actor, "is_authenticated", False) else None,
            actor_role=str(actor_role or ""),
            comment=str(comment or ""),
            ip_address=ip_address,
        )

        after = {
            "case": {
                "case_id": case.id,
                "status": case.status,
            },
        }

        reversion = NoveltyReversion.objects.create(
            case=case,
            reverted_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
            reverted_at=timezone.now(),
            comment=str(comment or ""),
            before_snapshot=before,
            after_snapshot=after,
        )

        return reversion
