from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import os

from django.core.cache import cache

from academic.models import AcademicYear
from students.models import Enrollment, FamilyMember, Student, StudentDocument


NO_ACTIVE_ENROLLMENT_MESSAGE = "Sin matrícula activa en el año actual; no se calcula el progreso."
NO_ACTIVE_YEAR_MESSAGE = "No hay año académico activo; no se calcula el progreso."


COMPLETION_CACHE_KEY_PREFIX = "student_completion:v1"
COMPLETION_CACHE_TTL_SECONDS = int(os.getenv("KAMPUS_COMPLETION_CACHE_TTL_SECONDS", "21600"))


def _completion_cache_key(student_id: int, academic_year_id: int) -> str:
    return f"{COMPLETION_CACHE_KEY_PREFIX}:{academic_year_id}:{student_id}"


def invalidate_completion_cache_for_student(student_id: int) -> None:
    """Invalidate cached completion for the current ACTIVE academic year."""

    active_year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
    if active_year is None:
        return
    cache.delete(_completion_cache_key(int(student_id), int(active_year.id)))


@dataclass(frozen=True)
class CompletionItem:
    key: str
    label: str


SECTION_ITEMS: dict[str, list[CompletionItem]] = {
    "identificacion": [
        CompletionItem("document_type", "Tipo de documento"),
        CompletionItem("document_number", "Número de documento"),
        CompletionItem("place_of_issue", "Lugar de expedición"),
        CompletionItem("nationality", "Nacionalidad"),
        CompletionItem("birth_date", "Fecha de nacimiento"),
        CompletionItem("sex", "Sexo"),
        CompletionItem("blood_type", "Tipo de sangre"),
    ],
    "residencia_contacto": [
        CompletionItem("address", "Dirección"),
        CompletionItem("neighborhood", "Barrio/Vereda"),
        CompletionItem("phone", "Teléfono"),
        CompletionItem("living_with", "Con quién vive"),
        CompletionItem("stratum", "Estrato"),
    ],
    "socioeconomica": [
        CompletionItem("ethnicity", "Etnia"),
        CompletionItem("sisben_score", "SISBÉN"),
        CompletionItem("eps", "EPS"),
    ],
    "desarrollo_apoyos": [
        CompletionItem("disability_description", "Descripción discapacidad"),
        CompletionItem("disability_type", "Tipo de discapacidad"),
        CompletionItem("support_needs", "Apoyos requeridos"),
    ],
    "salud_emergencia": [
        CompletionItem("allergies", "Alergias/Restricciones"),
        CompletionItem("emergency_contact_name", "Nombre contacto emergencia"),
        CompletionItem("emergency_contact_phone", "Teléfono emergencia"),
        CompletionItem("emergency_contact_relationship", "Parentesco emergencia"),
    ],
}


def _is_nonempty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        # Avoid counting default booleans as "complete".
        return False
    if hasattr(value, "strip"):
        return bool(str(value).strip())
    return True


def _truthy_param(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "si", "sí"}


def compute_completion_for_students(student_ids: list[int]) -> tuple[dict[int, dict[str, Any]], dict[str, Any]]:
    """Compute completion per student, plus an aggregate group summary.

    Completion is only computed for students who have an ACTIVE enrollment in the ACTIVE academic year.
    Results are cached per student + active academic year.
    """

    completion_by_id: dict[int, dict[str, Any]] = {}
    if not student_ids:
        return completion_by_id, _aggregate_group_summary(completion_by_id)

    active_year = AcademicYear.objects.filter(status=AcademicYear.STATUS_ACTIVE).first()
    if active_year is None:
        for sid in student_ids:
            completion_by_id[int(sid)] = {
                "percent": None,
                "filled": 0,
                "total": 0,
                "sections": {},
                "message": NO_ACTIVE_YEAR_MESSAGE,
            }
        return completion_by_id, _aggregate_group_summary(completion_by_id)

    missing_ids: list[int] = []
    for sid in student_ids:
        key = _completion_cache_key(int(sid), int(active_year.id))
        cached = cache.get(key)
        if cached is None:
            missing_ids.append(int(sid))
            continue
        completion_by_id[int(sid)] = cached

    if missing_ids:
        computed_by_id = _compute_completion_for_students_uncached(missing_ids, active_year)
        for sid, payload in computed_by_id.items():
            completion_by_id[int(sid)] = payload
            cache.set(
                _completion_cache_key(int(sid), int(active_year.id)),
                payload,
                timeout=COMPLETION_CACHE_TTL_SECONDS,
            )

    return completion_by_id, _aggregate_group_summary(completion_by_id)


def _compute_completion_for_students_uncached(
    student_ids: list[int],
    active_year: AcademicYear,
) -> dict[int, dict[str, Any]]:
    completion_by_id: dict[int, dict[str, Any]] = {}

    students = list(Student.objects.filter(pk__in=student_ids))

    enrollments = list(
        Enrollment.objects.select_related("grade", "grade__level")
        .filter(student_id__in=student_ids, academic_year=active_year, status="ACTIVE")
        .order_by("-id")
    )
    enrollment_by_student_id: dict[int, Enrollment] = {}
    for e in enrollments:
        enrollment_by_student_id.setdefault(e.student_id, e)

    doc_rows = list(
        StudentDocument.objects.filter(student_id__in=student_ids)
        .values_list("student_id", "document_type")
    )
    docs_by_student_id: dict[int, set[str]] = {}
    for sid, doc_type in doc_rows:
        docs_by_student_id.setdefault(int(sid), set()).add(str(doc_type))

    family_rows = list(
        FamilyMember.objects.filter(student_id__in=student_ids)
        .values_list(
            "student_id",
            "is_main_guardian",
            "relationship",
            "document_number",
            "identity_document",
        )
    )

    guardian_ok_by_student_id: dict[int, bool] = {sid: False for sid in student_ids}
    for sid, is_main, relationship, doc_number, identity_file in family_rows:
        rel = (relationship or "").strip()
        requires_identity = bool(is_main) or rel in {"Padre", "Acudiente"}
        if not requires_identity:
            continue
        if str(doc_number or "").strip() and bool(identity_file):
            guardian_ok_by_student_id[int(sid)] = True

    has_prior_real_enrollment = set(
        Enrollment.objects.filter(
            student_id__in=student_ids,
            academic_year__year__lt=active_year.year,
        )
        .exclude(final_status__istartswith="IMPORTADO")
        .exclude(group__isnull=True)
        .values_list("student_id", flat=True)
        .distinct()
    )

    for student in students:
        sid = int(student.pk)
        enrollment = enrollment_by_student_id.get(sid)
        if enrollment is None:
            completion_by_id[sid] = {
                "percent": None,
                "filled": 0,
                "total": 0,
                "sections": {},
                "message": NO_ACTIVE_ENROLLMENT_MESSAGE,
            }
            continue

        level_type = getattr(getattr(enrollment, "grade", None), "level", None)
        level_type = getattr(level_type, "level_type", None)
        level_type = (level_type or "").strip().upper()

        is_new_intake = sid not in has_prior_real_enrollment
        requires_academic_cert = is_new_intake and bool(str(getattr(enrollment, "origin_school", "") or "").strip())

        required_doc_types: list[str] = ["IDENTITY", "EPS"]
        if level_type in {"PRESCHOOL", "PRIMARY"}:
            required_doc_types.append("VACCINES")
        if requires_academic_cert:
            required_doc_types.append("ACADEMIC")

        student_docs = docs_by_student_id.get(sid, set())

        sections: dict[str, dict[str, Any]] = {}
        total = 0
        filled = 0

        for section_key, items in SECTION_ITEMS.items():
            section_total = 0
            section_filled = 0
            missing: list[str] = []

            for item in items:
                # Disability fields are only required if has_disability is true.
                if section_key == "desarrollo_apoyos" and not bool(getattr(student, "has_disability", False)):
                    continue

                section_total += 1
                total += 1

                value = getattr(student, item.key, None)
                ok = _is_nonempty(value)
                if ok:
                    section_filled += 1
                    filled += 1
                else:
                    missing.append(item.key)

            sections[section_key] = {
                "filled": section_filled,
                "total": section_total,
                "missing": missing,
            }

        # Referencias familiares (guardian)
        sections["referencias_familiares"] = {
            "filled": 1 if guardian_ok_by_student_id.get(sid) else 0,
            "total": 1,
            "missing": [] if guardian_ok_by_student_id.get(sid) else ["guardian_identity_document"],
        }
        total += 1
        if guardian_ok_by_student_id.get(sid):
            filled += 1

        # Documentos (StudentDocument)
        doc_missing: list[str] = []
        doc_filled = 0
        for doc_type in required_doc_types:
            if doc_type in student_docs:
                doc_filled += 1
            else:
                doc_missing.append(doc_type)

        sections["documentos"] = {
            "filled": doc_filled,
            "total": len(required_doc_types),
            "missing": doc_missing,
        }
        total += len(required_doc_types)
        filled += doc_filled

        percent = int(round((filled / total) * 100)) if total > 0 else 0

        completion_by_id[sid] = {
            "percent": percent,
            "filled": filled,
            "total": total,
            "sections": sections,
            "message": None,
        }

    return completion_by_id


def aggregate_group_summary_for_student_ids(
    completion_by_id: dict[int, dict[str, Any]],
    student_ids: list[int],
) -> dict[str, Any]:
    subset: dict[int, dict[str, Any]] = {}
    for sid in student_ids:
        payload = completion_by_id.get(int(sid))
        if payload is None:
            payload = {"percent": None}
        subset[int(sid)] = payload
    return _aggregate_group_summary(subset)


def _aggregate_group_summary(completion_by_id: dict[int, dict[str, Any]]) -> dict[str, Any]:
    percents: list[int] = []
    missing_enrollment = 0
    complete_100 = 0

    for payload in completion_by_id.values():
        p = payload.get("percent")
        if p is None:
            missing_enrollment += 1
            continue
        try:
            p_int = int(p)
        except Exception:
            continue
        percents.append(p_int)
        if p_int >= 100:
            complete_100 += 1

    if not percents:
        return {
            "avg_percent": None,
            "traffic_light": "grey",
            "students_total": len(completion_by_id),
            "students_computable": 0,
            "students_missing_enrollment": missing_enrollment,
            "complete_100_count": 0,
        }

    avg = int(round(sum(percents) / len(percents)))
    if avg >= 90:
        light = "green"
    elif avg >= 70:
        light = "yellow"
    else:
        light = "red"

    return {
        "avg_percent": avg,
        "traffic_light": light,
        "students_total": len(completion_by_id),
        "students_computable": len(percents),
        "students_missing_enrollment": missing_enrollment,
        "complete_100_count": complete_100,
    }
