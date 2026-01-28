from __future__ import annotations

import re

from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from academic.models import AcademicYear, Grade, Group
from students.models import Enrollment

from ..models import NoveltyAttachment, NoveltyCase, NoveltyCaseTransition, NoveltyExecution, NoveltyRequiredDocumentRule
from .capacity import assert_capacity_available, capacity_lock_keys_for_group, lock_rows_for_group_capacity
from .locks import multi_lock


@dataclass
class ExecutionResult:
    execution: NoveltyExecution
    case: NoveltyCase


def _snapshot_case(case: NoveltyCase) -> dict:
    return {
        "case_id": case.id,
        "radicado": case.radicado,
        "status": case.status,
        "student_id": case.student_id,
        "institution_id": case.institution_id,
        "novelty_type_code": case.novelty_type.code,
        "novelty_reason_id": case.novelty_reason_id,
        "payload": case.payload,
    }


def _snapshot_student_state(case: NoveltyCase) -> dict:
    student = case.student
    user = student.user

    enrollments = list(
        student.enrollment_set.select_related("academic_year", "grade", "group", "campus")
        .order_by("-academic_year__year")
        .values(
            "id",
            "academic_year_id",
            "grade_id",
            "group_id",
            "campus_id",
            "status",
            "origin_school",
            "final_status",
            "enrolled_at",
        )
    )

    return {
        "student_id": student.pk,
        "user_id": user.pk,
        "user_is_active": bool(getattr(user, "is_active", True)),
        "enrollments": enrollments,
    }


def _missing_required_documents(case: NoveltyCase) -> list[str]:
    rules = NoveltyRequiredDocumentRule.objects.filter(
        novelty_type=case.novelty_type,
        is_required=True,
    ).filter(Q(novelty_reason__isnull=True) | Q(novelty_reason=case.novelty_reason))

    required = set(rules.values_list("doc_type", flat=True))
    if not required:
        return []

    present = set(
        NoveltyAttachment.objects.filter(case=case, doc_type__in=required)
        .values_list("doc_type", flat=True)
        .distinct()
    )
    return sorted(required - present)


def execute_case(
    *,
    case_id: int,
    actor,
    comment: str,
    ip_address: str | None,
    idempotency_key: str | None = None,
) -> ExecutionResult:
    """Execute an approved novelty case.

    MVP supported novelty types by code:
    - retiro: inactivate user + mark ACTIVE enrollments as RETIRED
    - reingreso: activate user + optionally (re)activate/create enrollment
    - cambio_interno: change ACTIVE enrollment group (payload: group_id / destination_group_id)
    - graduacion: mark ACTIVE enrollments as GRADUATED

    Idempotency:
    - If the case already has an execution, it is returned.
    - If idempotency_key matches an existing execution, it is returned.
    """

    with transaction.atomic():
        case = (
            # Postgres does not allow FOR UPDATE on the nullable side of an outer join.
            # `novelty_reason` is optional, so `select_related('novelty_reason')` becomes a LEFT OUTER JOIN.
            # Lock only the case row to keep the transaction safe without triggering that limitation.
            NoveltyCase.objects.select_for_update(of=("self",))
            .select_related("student__user", "novelty_type", "novelty_reason")
            .get(pk=case_id)
        )

        if hasattr(case, "execution"):
            return ExecutionResult(execution=case.execution, case=case)

        if case.status != NoveltyCase.Status.APPROVED:
            raise ValueError("Solo se puede ejecutar una novedad en estado APROBADA")

        code = (case.novelty_type.code or "").strip().lower()
        is_graduacion = code in {"graduacion", "graduación", "graduado", "graduada"}

        if not is_graduacion:
            missing = _missing_required_documents(case)
            if missing:
                raise ValueError(f"No se puede ejecutar: faltan soportes obligatorios: {', '.join(missing)}")

        key = (idempotency_key or case.idempotency_key or f"execute:{case_id}:{case.radicado or ''}").strip()
        if not key:
            key = f"execute:{case_id}:{timezone.now().isoformat()}"

        existing = NoveltyExecution.objects.filter(idempotency_key=key).first()
        if existing is not None:
            return ExecutionResult(execution=existing, case=case)

        before = {"case": _snapshot_case(case), "student": _snapshot_student_state(case)}

        if code == "retiro":
            _execute_retiro(case)
        elif code == "reingreso":
            _execute_reingreso(case)
        elif code in {"cambio_interno", "cambio-interno", "cambio_grupo", "cambio-grupo"}:
            _execute_cambio_interno(case)
        elif is_graduacion:
            _execute_graduacion(case)
        else:
            raise ValueError(f"Tipo de novedad no soportado para ejecución MVP: {case.novelty_type.code}")

        case.executed_at = timezone.now()
        case.status = NoveltyCase.Status.EXECUTED
        if not case.idempotency_key:
            case.idempotency_key = key
        case.save(update_fields=["executed_at", "status", "idempotency_key", "updated_at"])

        actor_role = getattr(actor, "role", "") if actor and getattr(actor, "is_authenticated", False) else ""
        NoveltyCaseTransition.objects.create(
            case=case,
            from_status=NoveltyCase.Status.APPROVED,
            to_status=NoveltyCase.Status.EXECUTED,
            actor=actor if actor and getattr(actor, "is_authenticated", False) else None,
            actor_role=str(actor_role or ""),
            comment=str(comment or ""),
            ip_address=ip_address,
        )

        after = {"case": _snapshot_case(case), "student": _snapshot_student_state(case)}

        execution = NoveltyExecution.objects.create(
            case=case,
            idempotency_key=key,
            executed_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
            executed_at=timezone.now(),
            before_snapshot=before,
            after_snapshot=after,
        )

        return ExecutionResult(execution=execution, case=case)


def _execute_retiro(case: NoveltyCase) -> None:
    student = case.student
    user = student.user

    if getattr(user, "is_active", True):
        user.is_active = False
        user.save(update_fields=["is_active"])

    student.enrollment_set.filter(status="ACTIVE").update(status="RETIRED")


def _execute_reingreso(case: NoveltyCase) -> None:
    student = case.student
    user = student.user

    if not getattr(user, "is_active", True):
        user.is_active = True
        user.save(update_fields=["is_active"])

    payload = case.payload or {}

    # Try to reactivate an existing enrollment.
    enrollment = student.enrollment_set.filter(status="RETIRED").order_by("-academic_year__year").first()

    # Prefer active academic year
    year = AcademicYear.objects.filter(status="ACTIVE").first()
    if "academic_year_id" in payload:
        try:
            year = AcademicYear.objects.get(pk=int(payload["academic_year_id"]))
        except Exception:
            pass

    if enrollment and year and enrollment.academic_year_id == year.id:
        enrollment.status = "ACTIVE"
        enrollment.save(update_fields=["status"])
        return

    if year is None:
        return

    grade_id = payload.get("grade_id")
    if grade_id is None:
        return

    try:
        grade = Grade.objects.get(pk=int(grade_id))
    except Exception:
        return

    group = None
    group_id = payload.get("group_id") or payload.get("destination_group_id")
    if group_id not in (None, ""):
        try:
            group = Group.objects.get(pk=int(group_id))
        except Exception:
            group = None

    if group is not None:
        with multi_lock(capacity_lock_keys_for_group(group)):
            lock_rows_for_group_capacity(group)
            assert_capacity_available(group=group)

    # Create or update enrollment for the year.
    enr, created = Enrollment.objects.get_or_create(
        student=student,
        academic_year=year,
        defaults={"grade": grade, "group": group, "status": "ACTIVE"},
    )
    if not created:
        enr.grade = grade
        if group is not None:
            enr.group = group
        enr.status = "ACTIVE"
        enr.save(update_fields=["grade", "group", "status"])


def _execute_cambio_interno(case: NoveltyCase) -> None:
    student = case.student
    payload = case.payload or {}

    enrollment = student.enrollment_set.filter(status="ACTIVE").select_related("academic_year", "grade", "campus").first()
    if enrollment is None:
        raise ValueError("No hay matrícula activa para aplicar cambio interno")

    group_id = payload.get("group_id") or payload.get("destination_group_id")
    if not group_id:
        raise ValueError("Falta group_id/destination_group_id en payload")

    try:
        group = Group.objects.select_related("grade", "academic_year", "campus").get(pk=int(group_id))
    except Exception:
        raise ValueError("Grupo destino inválido")

    # Keep MVP strict: group must match enrollment year and grade.
    if group.academic_year_id != enrollment.academic_year_id:
        raise ValueError("El grupo destino no corresponde al mismo año lectivo")
    if group.grade_id != enrollment.grade_id:
        raise ValueError("El grupo destino no corresponde al mismo grado")

    if enrollment.group_id != group.id:
        with multi_lock(capacity_lock_keys_for_group(group)):
            lock_rows_for_group_capacity(group)
            assert_capacity_available(group=group, exclude_enrollment_id=enrollment.id)

    enrollment.group = group
    enrollment.save(update_fields=["group"])


def _execute_graduacion(case: NoveltyCase) -> None:
    student = case.student
    user = student.user

    def _is_undecimo_grade(*, grade_name: str | None, grade_ordinal: int | None) -> bool:
        if grade_ordinal in {11, 13}:
            return True
        name = (grade_name or "").strip().lower()
        if not name:
            return False
        if "undecimo" in name or "undécimo" in name:
            return True
        if re.search(r"\b11\b", name):
            return True
        return False

    active_qs = student.enrollment_set.filter(status="ACTIVE")
    if not active_qs.exists():
        raise ValueError("No hay matrícula activa para marcar como graduado")

    active = active_qs.select_related("grade").order_by("-academic_year__year", "-id").first()
    grade_name = getattr(getattr(active, "grade", None), "name", None) if active else None
    grade_ordinal = getattr(getattr(active, "grade", None), "ordinal", None) if active else None
    if not _is_undecimo_grade(grade_name=grade_name, grade_ordinal=grade_ordinal):
        raise ValueError("La graduación solo aplica para estudiantes de grado Undécimo (11)")

    # Mark as graduated.
    active_qs.update(status="GRADUATED")

    # Best-effort: fill legacy final_status when empty.
    student.enrollment_set.filter(status="GRADUATED").filter(final_status="").update(final_status="GRADUADO")

    # Graduated students should not remain active.
    if not student.enrollment_set.filter(status="ACTIVE").exists() and getattr(user, "is_active", True):
        user.is_active = False
        user.save(update_fields=["is_active"])
