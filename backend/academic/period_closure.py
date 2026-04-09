from __future__ import annotations

from academic.models import AcademicYear, Period


def get_period_close_blocker(period: Period) -> dict[str, object] | None:
    academic_year = getattr(period, "academic_year", None)
    if academic_year is not None and getattr(academic_year, "status", None) == AcademicYear.STATUS_CLOSED:
        return {"detail": "No se pueden cerrar periodos de un año lectivo finalizado."}

    from students.models import ConditionalPromotionPlan

    pending_qs = ConditionalPromotionPlan.objects.filter(
        due_period=period,
        status=ConditionalPromotionPlan.STATUS_OPEN,
    )
    pending_count = pending_qs.count()
    if pending_count > 0:
        return {
            "detail": "No se puede cerrar el periodo: hay PAP pendientes.",
            "pending_pap_count": pending_count,
            "pending_enrollment_ids_sample": list(pending_qs.values_list("enrollment_id", flat=True)[:50]),
        }

    return None


def close_period(period: Period) -> bool:
    if period.is_closed:
        return False

    period.is_closed = True
    period.save(update_fields=["is_closed"])
    return True