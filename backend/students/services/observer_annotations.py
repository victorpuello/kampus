from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

from django.db import transaction
from django.utils import timezone

from academic.ai import AIService, AIServiceError
from academic.models import GradeSheet, TeacherAssignment
from academic.promotion import PASSING_SCORE_DEFAULT, _compute_subject_final_for_enrollments
from notifications.services import create_notification

from students.models import Enrollment, ObserverAnnotation


@dataclass(frozen=True)
class GroupPeriodAnnotationComputation:
    student_id: int
    enrollment_id: int
    failed_subjects: int


def _maybe_polish_text(text: str, *, ai_service: AIService | None = None, timeout_seconds: int = 12) -> str:
    if not (text or "").strip():
        return text
    try:
        ai = ai_service or AIService()

        # Run the provider call in another thread so this automation never hangs
        # indefinitely if the SDK blocks on network.
        ex = ThreadPoolExecutor(max_workers=1)
        fut = ex.submit(ai.improve_text, text)
        try:
            return fut.result(timeout=timeout_seconds)
        finally:
            ex.shutdown(wait=False, cancel_futures=True)

    except FutureTimeoutError:
        return text
    except Exception:
        return text


def _compute_failures_for_group_period(*, group_id: int, academic_year_id: int, period_id: int) -> List[GroupPeriodAnnotationComputation]:
    enrollments = list(
        Enrollment.objects.filter(
            academic_year_id=academic_year_id,
            group_id=group_id,
            status="ACTIVE",
        ).only("id", "student_id")
    )
    if not enrollments:
        return []

    enrollment_ids = [int(e.id) for e in enrollments]
    failed_by_enrollment: Dict[int, int] = {int(e.id): 0 for e in enrollments}

    assignments = list(
        TeacherAssignment.objects.filter(
            academic_year_id=academic_year_id,
            group_id=group_id,
        ).select_related("academic_load", "academic_load__subject")
    )

    if not assignments:
        return [
            GroupPeriodAnnotationComputation(
                student_id=int(e.student_id),
                enrollment_id=int(e.id),
                failed_subjects=0,
            )
            for e in enrollments
        ]

    period = GradeSheet.objects.select_related("period").values_list("period", flat=True)
    # period object is fetched later in caller; keep computation lean.

    from academic.models import Period

    period_obj = Period.objects.get(id=int(period_id))

    passing_score = Decimal(PASSING_SCORE_DEFAULT)

    for ta in assignments:
        try:
            finals = _compute_subject_final_for_enrollments(
                teacher_assignment=ta,
                period=period_obj,
                enrollment_ids=enrollment_ids,
            )
        except Exception:
            continue

        for enrollment_id, score in finals.items():
            try:
                if Decimal(score) < passing_score:
                    failed_by_enrollment[int(enrollment_id)] = failed_by_enrollment.get(int(enrollment_id), 0) + 1
            except Exception:
                continue

    out: List[GroupPeriodAnnotationComputation] = []
    for e in enrollments:
        out.append(
            GroupPeriodAnnotationComputation(
                student_id=int(e.student_id),
                enrollment_id=int(e.id),
                failed_subjects=int(failed_by_enrollment.get(int(e.id), 0)),
            )
        )
    return out


def maybe_generate_group_period_annotations(*, gradesheet_id: int) -> None:
    """When the last grade sheet for a group+period is published, create/update automatic annotations.

    Idempotency: uses ObserverAnnotation.rule_key (per student+period).
    """

    gs = (
        GradeSheet.objects.select_related(
            "teacher_assignment",
            "teacher_assignment__group",
            "teacher_assignment__academic_year",
            "period",
        )
        .only(
            "id",
            "status",
            "teacher_assignment_id",
            "period_id",
            "teacher_assignment__group_id",
            "teacher_assignment__group__director_id",
            "teacher_assignment__academic_year_id",
            "period__name",
        )
        .get(id=int(gradesheet_id))
    )

    if gs.status != GradeSheet.STATUS_PUBLISHED:
        return

    group_id = int(gs.teacher_assignment.group_id)
    academic_year_id = int(gs.teacher_assignment.academic_year_id)
    period_id = int(gs.period_id)

    expected_assignments = TeacherAssignment.objects.filter(
        academic_year_id=academic_year_id,
        group_id=group_id,
        academic_load__isnull=False,
    ).only("id")

    expected_count = expected_assignments.count()
    if expected_count <= 0:
        return

    published_count = GradeSheet.objects.filter(
        teacher_assignment_id__in=list(expected_assignments.values_list("id", flat=True)),
        period_id=period_id,
        status=GradeSheet.STATUS_PUBLISHED,
    ).count()

    if published_count != expected_count:
        return

    computations = _compute_failures_for_group_period(
        group_id=group_id,
        academic_year_id=academic_year_id,
        period_id=period_id,
    )
    if not computations:
        return

    rule_key = f"AUTO_GROUP_PERIOD_PUBLISHED:{period_id}"

    # Notify director when a student has >3 failed subjects.
    director_id = getattr(gs.teacher_assignment.group, "director_id", None)

    from users.models import User

    director = User.objects.filter(id=director_id).first() if director_id else None

    ai_service = AIService()

    with transaction.atomic():
        polished_text_by_failed: Dict[int, str] = {}
        polished_commitments_by_failed: Dict[int, str] = {}
        for item in computations:
            failed = int(item.failed_subjects)

            if failed <= 0:
                a_type = ObserverAnnotation.TYPE_PRAISE
                title = "Felicitación"
                base_text = (
                    "Felicitaciones por el buen desempeño académico en este periodo. "
                    "Se recomienda mantener los hábitos de estudio, la puntualidad en la entrega de actividades "
                    "y la participación en clase."
                )
                base_commitments = ""
            elif failed <= 3:
                a_type = ObserverAnnotation.TYPE_OBSERVATION
                title = "Seguimiento académico"
                base_text = (
                    f"Se identifica necesidad de refuerzo: {failed} asignatura(s) con desempeño bajo en el periodo. "
                    "Se recomienda revisar cuadernos y actividades pendientes, asistir a refuerzos, y fortalecer hábitos de estudio."
                )
                base_commitments = "- Asistir a refuerzos o nivelaciones\n- Entregar actividades pendientes\n- Estudiar con un plan semanal"
            else:
                a_type = ObserverAnnotation.TYPE_ALERT
                title = "Alerta académica"
                base_text = (
                    f"Alerta: {failed} asignatura(s) con desempeño bajo en el periodo. "
                    "Se requiere plan de mejora inmediato y seguimiento con director de grupo y acudiente."
                )
                base_commitments = (
                    "- Reunión con acudiente y director de grupo\n"
                    "- Asistir a refuerzos y presentar actividades de recuperación\n"
                    "- Definir horario semanal de estudio y evidencias"
                )

            # AI polishing is cached by failed count to keep the automation fast.
            if failed not in polished_text_by_failed:
                polished_text_by_failed[failed] = _maybe_polish_text(base_text, ai_service=ai_service)
            text = polished_text_by_failed[failed]

            if failed not in polished_commitments_by_failed:
                polished_commitments_by_failed[failed] = _maybe_polish_text(base_commitments, ai_service=ai_service)
            commitments = polished_commitments_by_failed[failed]

            annotation, created = ObserverAnnotation.objects.get_or_create(
                student_id=item.student_id,
                period_id=period_id,
                rule_key=rule_key,
                defaults={
                    "annotation_type": a_type,
                    "title": title,
                    "text": text,
                    "commitments": commitments,
                    "is_automatic": True,
                    "meta": {"failed_subjects": failed, "source": "gradesheets_all_published"},
                },
            )

            if not created:
                # Best-effort refresh if the computation changed.
                annotation.annotation_type = a_type
                annotation.title = title
                annotation.text = text
                annotation.commitments = commitments
                annotation.is_automatic = True
                annotation.meta = {"failed_subjects": failed, "source": "gradesheets_all_published"}
                annotation.save(update_fields=["annotation_type", "title", "text", "commitments", "is_automatic", "meta", "updated_at"])

            if failed > 3 and director is not None:
                create_notification(
                    recipient=director,
                    type="OBSERVADOR_ALERT",
                    title="Alerta académica en tu grupo",
                    body=f"Un estudiante tiene {failed} asignaturas en bajo desempeño en el periodo {gs.period.name}.",
                    url=f"/students/{item.student_id}",
                    dedupe_key=f"OBSERVADOR_ALERT:{item.student_id}:{period_id}",
                    dedupe_within_seconds=60 * 60 * 24 * 7,
                )
