from __future__ import annotations

import re
from typing import Any

from django.utils import timezone

from academic.ai import AIService, AIConfigError, AIParseError, AIProviderError

from .models import (
    DisciplineCase,
    DisciplineCaseDecisionSuggestion,
    DisciplineCaseEvent,
    ManualConvivencia,
    ManualConvivenciaChunk,
)


_WORD_RE = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)


def _severity_label(code: str) -> str:
    if code == "MINOR":
        return "Leve"
    if code == "MAJOR":
        return "Grave"
    if code == "VERY_MAJOR":
        return "Gravísima"
    return code or "—"


def _law1620_label(code: str) -> str:
    if code in {"I", "II", "III"}:
        return f"Tipo {code}"
    if code == "UNKNOWN":
        return "Sin clasificar"
    return code or "—"


def _tokens(text: str) -> set[str]:
    words = _WORD_RE.findall((text or "").lower())
    # Keep moderately long tokens to reduce noise.
    return {w for w in words if len(w) >= 4}


def pick_relevant_chunks(manual: ManualConvivencia, query_text: str, *, limit: int = 6) -> list[ManualConvivenciaChunk]:
    qs = ManualConvivenciaChunk.objects.filter(manual=manual).only("id", "text", "label")
    query_tokens = _tokens(query_text)
    if not query_tokens:
        return list(qs.order_by("index")[:limit])

    scored: list[tuple[int, ManualConvivenciaChunk]] = []
    for ch in qs.iterator(chunk_size=200):
        ct = _tokens(ch.text)
        score = len(query_tokens & ct)
        if score:
            scored.append((score, ch))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [c for _, c in scored[:limit]]
    if len(top) < limit:
        # backfill with earliest chunks to keep some context
        existing = {c.id for c in top}
        for ch in qs.order_by("index"):
            if ch.id in existing:
                continue
            top.append(ch)
            if len(top) >= limit:
                break
    return top


def _build_prompt(case: DisciplineCase, manual: ManualConvivencia, chunks: list[ManualConvivenciaChunk]) -> str:
    descargos = list(
        case.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).values_list("text", flat=True)
    )

    evidence_names = list(
        case.attachments.filter(kind__in=["EVIDENCE", "DESCARGOS"]).values_list("file", flat=True)
    )

    provided_chunks = "\n\n".join(
        [
            f"[FRAGMENTO {ch.id}]\n{(ch.label + ': ') if ch.label else ''}{ch.text}"
            for ch in chunks
        ]
    )

    return f"""
Actúa como un COORDINADOR DE CONVIVENCIA y experto en debido proceso escolar.

Objetivo: proponer una SUGERENCIA DE DECISIÓN para un caso disciplinario, alineada EXCLUSIVAMENTE con el Manual de Convivencia (fragmentos provistos).

Reglas estrictas:
- Escribe en español, tono formal, claro y aplicable en un colegio.
- No uses palabras en inglés. Usa términos como "fragmento", "artículo", "numeral", "capítulo", "sección".
- NO inventes artículos ni cites contenido que no esté en los FRAGMENTOS provistos.
- Las citas deben ser VERIFICABLES: el campo quote debe ser un fragmento textual exacto copiado del chunk correspondiente.
- Si no encuentras fundamento suficiente en los fragmentos, indica limitación y devuelve citations vacío.
- No incluyas datos sensibles adicionales ni nombres propios que no estén en los datos.

Devuelve ESTRICTAMENTE un objeto JSON con estas claves:
- suggested_decision_text: string (texto que se puede colocar como "Decisión" del caso)
- reasoning: string (fundamento breve)
- citations: array de objetos con {{chunk_id: number, quote: string, label: string}}
    - label: string (título corto en español para ayudar a entender la cita; puede ir vacío)

Datos del caso:
- Caso ID: {case.id}
- Hechos (narrativa): {case.narrative}
- Clasificación manual: {_severity_label(case.manual_severity)}
- Clasificación Ley 1620: {_law1620_label(case.law_1620_type)}
- Descargos (pueden ser múltiples): {descargos}
- Evidencias adjuntas (nombres/rutas): {evidence_names}

Manual activo:
- Título: {manual.title}
- Versión: {manual.version}

Fragmentos del manual disponibles para citar (NO uses la palabra "chunk"):
{provided_chunks}
""".strip()


def _validate_and_normalize(ai_payload: dict[str, Any], allowed_chunk_ids: set[int], chunk_map: dict[int, ManualConvivenciaChunk]) -> tuple[str, str, list[dict[str, Any]]]:
    decision_text = str(ai_payload.get("suggested_decision_text") or "").strip()
    reasoning = str(ai_payload.get("reasoning") or "").strip()

    citations_in = ai_payload.get("citations")
    citations: list[dict[str, Any]] = []
    if isinstance(citations_in, list):
        for c in citations_in:
            if not isinstance(c, dict):
                continue
            try:
                chunk_id = int(c.get("chunk_id"))
            except Exception:
                continue
            if chunk_id not in allowed_chunk_ids:
                continue
            quote = str(c.get("quote") or "").strip()
            if not quote:
                continue
            # Verify quote appears in chunk text.
            if quote not in (chunk_map[chunk_id].text or ""):
                continue
            label = str(c.get("label") or chunk_map[chunk_id].label or "").strip()
            citations.append({"chunk_id": chunk_id, "quote": quote[:500], "label": label[:200]})

    if not decision_text:
        raise AIParseError("AI response missing suggested_decision_text")

    return decision_text, reasoning, citations


def suggest_decision_for_case(case: DisciplineCase, manual: ManualConvivencia, user) -> DisciplineCaseDecisionSuggestion:
    # Ensure chunks exist
    chunks_qs = ManualConvivenciaChunk.objects.filter(manual=manual)
    if not chunks_qs.exists():
        raise ValueError("El manual activo no tiene texto indexado (chunks).")

    # Build query context
    descargos_text = "\n\n".join(
        list(case.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).values_list("text", flat=True))
    )
    query = "\n\n".join([case.narrative or "", descargos_text])

    chunks = pick_relevant_chunks(manual, query)
    allowed_chunk_ids = {c.id for c in chunks}
    chunk_map = {c.id: c for c in chunks}

    ai = AIService()
    prompt = _build_prompt(case, manual, chunks)

    try:
        ai._ensure_available()  # type: ignore[attr-defined]
        response = ai.model.generate_content(prompt)  # type: ignore[union-attr]
        payload = ai._extract_json_object(getattr(response, "text", "") or "")  # type: ignore[attr-defined]
        decision_text, reasoning, citations = _validate_and_normalize(payload, allowed_chunk_ids, chunk_map)
    except (AIConfigError, AIParseError, AIProviderError):
        raise
    except Exception as e:
        raise AIProviderError(str(e)) from e

    suggestion = DisciplineCaseDecisionSuggestion.objects.create(
        case=case,
        manual=manual,
        created_by=user if getattr(user, "is_authenticated", False) else None,
        status=DisciplineCaseDecisionSuggestion.Status.DRAFT,
        suggested_decision_text=decision_text,
        reasoning=reasoning,
        citations=citations,
    )

    return suggestion


def approve_suggestion(suggestion: DisciplineCaseDecisionSuggestion, user) -> DisciplineCaseDecisionSuggestion:
    suggestion.status = DisciplineCaseDecisionSuggestion.Status.APPROVED
    suggestion.approved_by = user
    suggestion.approved_at = timezone.now()
    suggestion.save(update_fields=["status", "approved_by", "approved_at"])
    return suggestion


def apply_suggestion(case: DisciplineCase, suggestion: DisciplineCaseDecisionSuggestion, user) -> None:
    # Mirror decide() business rules
    if case.status != DisciplineCase.Status.OPEN:
        raise ValueError("El caso no está en estado ABIERTO.")

    has_descargos = case.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).exists()
    if not has_descargos:
        raise ValueError("No se puede decidir sin registrar descargos.")

    if suggestion.status != DisciplineCaseDecisionSuggestion.Status.APPROVED:
        raise ValueError("La sugerencia debe estar APROBADA para aplicar.")

    now = timezone.now()
    case.decision_text = (suggestion.suggested_decision_text or "").strip()
    case.decided_at = now
    case.decided_by = user
    case.status = DisciplineCase.Status.DECIDED
    case.save(update_fields=["decision_text", "decided_at", "decided_by", "status", "updated_at"])

    DisciplineCaseEvent.objects.create(
        case=case,
        event_type=DisciplineCaseEvent.Type.DECISION,
        text=case.decision_text,
        created_by=user,
    )

    suggestion.status = DisciplineCaseDecisionSuggestion.Status.APPLIED
    suggestion.applied_by = user
    suggestion.applied_at = now
    suggestion.save(update_fields=["status", "applied_by", "applied_at"])
