from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

from django.db.models import Count
from django.db.models import Q

from academic.ai import AIService
from students.models import ObserverAnnotation, Student

from .models import ElectionCandidate, ElectionProcess, ElectionRole


def _normalize_doc(value: str | None) -> str:
    return str(value or "").strip().upper()


def _build_student_maps(candidates: list[ElectionCandidate]) -> tuple[dict[int, Student], dict[str, Student]]:
    student_ids = {int(candidate.student_id_ref) for candidate in candidates if candidate.student_id_ref}
    document_numbers = {_normalize_doc(candidate.student_document_number) for candidate in candidates if _normalize_doc(candidate.student_document_number)}

    if not student_ids and not document_numbers:
        return {}, {}

    students = Student.objects.select_related("user").filter(
        Q(user_id__in=student_ids) | Q(document_number__in=document_numbers)
    )

    by_id: dict[int, Student] = {}
    by_doc: dict[str, Student] = {}
    for student in students:
        by_id[int(student.user_id)] = student
        normalized_doc = _normalize_doc(student.document_number)
        if normalized_doc:
            by_doc[normalized_doc] = student
    return by_id, by_doc


def _resolve_student(candidate: ElectionCandidate, by_id: dict[int, Student], by_doc: dict[str, Student]) -> Student | None:
    if candidate.student_id_ref:
        found = by_id.get(int(candidate.student_id_ref))
        if found is not None:
            return found

    normalized_doc = _normalize_doc(candidate.student_document_number)
    if normalized_doc:
        return by_doc.get(normalized_doc)

    return None


def _personalize_with_ai(base_text: str, *, timeout_seconds: int = 10) -> tuple[str, bool]:
    try:
        ai_service = AIService()
        ex = ThreadPoolExecutor(max_workers=1)
        fut = ex.submit(ai_service.improve_text, base_text)
        try:
            generated = (fut.result(timeout=timeout_seconds) or "").strip()
        finally:
            ex.shutdown(wait=False, cancel_futures=True)

        if generated:
            return generated, True
        return base_text, False
    except FutureTimeoutError:
        return base_text, False
    except Exception:
        return base_text, False


def _upsert_annotation(
    *,
    student: Student,
    rule_key: str,
    title: str,
    text: str,
    meta: dict,
    created_by_id: int | None,
) -> bool:
    existing = ObserverAnnotation.objects.filter(
        student=student,
        period__isnull=True,
        rule_key=rule_key,
        is_deleted=False,
    ).first()

    payload = {
        "annotation_type": ObserverAnnotation.TYPE_PRAISE,
        "title": title,
        "text": text,
        "is_automatic": True,
        "meta": meta,
        "created_by_id": created_by_id,
        "updated_by_id": created_by_id,
    }

    if existing is None:
        ObserverAnnotation.objects.create(
            student=student,
            period=None,
            rule_key=rule_key,
            **payload,
        )
        return True

    existing.annotation_type = ObserverAnnotation.TYPE_PRAISE
    existing.title = title
    existing.text = text
    existing.is_automatic = True
    existing.meta = meta
    existing.updated_by_id = created_by_id
    existing.save(update_fields=["annotation_type", "title", "text", "is_automatic", "meta", "updated_by", "updated_at"])
    return False


def generate_observer_congratulations_for_election(*, process_id: int, created_by_id: int | None = None) -> dict:
    process = ElectionProcess.objects.filter(id=process_id).first()
    if process is None:
        return {
            "process_id": process_id,
            "winner_annotations_created": 0,
            "participant_annotations_created": 0,
            "winner_annotations_updated": 0,
            "participant_annotations_updated": 0,
            "ai_generated_messages": 0,
            "fallback_messages": 0,
            "skipped_without_student": 0,
        }

    roles = list(
        ElectionRole.objects.filter(
            process=process,
            code__in=[ElectionRole.CODE_PERSONERO, ElectionRole.CODE_CONTRALOR],
        ).order_by("display_order", "id")
    )

    active_candidates = list(
        ElectionCandidate.objects.filter(role__process=process, is_active=True)
        .select_related("role")
        .annotate(votes_count=Count("votes"))
        .order_by("role__display_order", "role_id", "display_order", "id")
    )

    candidates_by_role: dict[int, list[ElectionCandidate]] = {}
    for candidate in active_candidates:
        candidates_by_role.setdefault(int(candidate.role_id), []).append(candidate)

    winners: list[ElectionCandidate] = []
    for role in roles:
        role_candidates = candidates_by_role.get(int(role.id), [])
        if not role_candidates:
            continue

        max_votes = max(int(getattr(candidate, "votes_count", 0) or 0) for candidate in role_candidates)
        if max_votes <= 0:
            continue

        winners.extend(
            candidate
            for candidate in role_candidates
            if int(getattr(candidate, "votes_count", 0) or 0) == max_votes
        )

    student_by_id, student_by_doc = _build_student_maps(active_candidates)

    summary = {
        "process_id": int(process.id),
        "winner_annotations_created": 0,
        "participant_annotations_created": 0,
        "winner_annotations_updated": 0,
        "participant_annotations_updated": 0,
        "ai_generated_messages": 0,
        "fallback_messages": 0,
        "skipped_without_student": 0,
    }

    winner_ids = {int(candidate.id) for candidate in winners}

    for candidate in winners:
        student = _resolve_student(candidate, student_by_id, student_by_doc)
        if student is None:
            summary["skipped_without_student"] += 1
            continue

        full_name = (student.user.get_full_name() or candidate.name or "Estudiante").strip()
        role_label = candidate.role.title
        votes = int(getattr(candidate, "votes_count", 0) or 0)

        base_text = (
            f"{full_name}, felicitaciones por ser elegido como {role_label} en la jornada electoral {process.name}. "
            f"Tu candidatura obtuvo {votes} voto(s). Tu liderazgo inspira a la comunidad educativa."
        )
        generated_text, generated_by_ai = _personalize_with_ai(base_text)
        summary["ai_generated_messages" if generated_by_ai else "fallback_messages"] += 1

        created = _upsert_annotation(
            student=student,
            rule_key=f"ELECTION_WINNER:{process.id}:{candidate.role.code}:{candidate.id}",
            title=f"Felicitación por elección a {role_label}",
            text=generated_text,
            meta={
                "source": "elections",
                "kind": "winner",
                "process_id": int(process.id),
                "process_name": process.name,
                "role_code": candidate.role.code,
                "role_title": role_label,
                "candidate_id": int(candidate.id),
                "votes": votes,
                "generated_by_ai": generated_by_ai,
            },
            created_by_id=created_by_id,
        )
        if created:
            summary["winner_annotations_created"] += 1
        else:
            summary["winner_annotations_updated"] += 1

    for candidate in active_candidates:
        student = _resolve_student(candidate, student_by_id, student_by_doc)
        if student is None:
            summary["skipped_without_student"] += 1
            continue

        full_name = (student.user.get_full_name() or candidate.name or "Estudiante").strip()
        role_label = candidate.role.title
        base_text = (
            f"{full_name}, felicitaciones por participar como candidato en {role_label} "
            f"durante la jornada {process.name}. Tu compromiso fortalece la democracia escolar."
        )
        generated_text, generated_by_ai = _personalize_with_ai(base_text)
        summary["ai_generated_messages" if generated_by_ai else "fallback_messages"] += 1

        created = _upsert_annotation(
            student=student,
            rule_key=f"ELECTION_PARTICIPANT:{process.id}:{candidate.id}",
            title=f"Felicitación por candidatura a {role_label}",
            text=generated_text,
            meta={
                "source": "elections",
                "kind": "participant",
                "process_id": int(process.id),
                "process_name": process.name,
                "role_code": candidate.role.code,
                "role_title": role_label,
                "candidate_id": int(candidate.id),
                "is_winner": int(candidate.id) in winner_ids,
                "generated_by_ai": generated_by_ai,
            },
            created_by_id=created_by_id,
        )
        if created:
            summary["participant_annotations_created"] += 1
        else:
            summary["participant_annotations_updated"] += 1

    return summary
