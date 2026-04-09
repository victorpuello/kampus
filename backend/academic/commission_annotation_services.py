from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any

from django.contrib.auth import get_user_model

from students.models import ObserverAnnotation

from .ai import AIService, AIServiceError
from .models import Commission
from .reports import build_commission_performance_snapshot


logger = logging.getLogger(__name__)

_AI_TIMEOUT_SECONDS = 12


def _default_commitments_payload() -> dict[str, list[str]]:
	return {
		"student_commitments": [
			"Asistir puntualmente a clases y a los espacios de refuerzo programados.",
			"Cumplir con la entrega oportuna de actividades y evaluaciones pendientes.",
			"Mantener un plan semanal de estudio y repaso de los temas priorizados.",
			"Solicitar apoyo al docente cuando se presenten dudas en las asignaturas en dificultad.",
		],
		"guardian_commitments": [
			"Hacer seguimiento permanente a tareas, horarios de estudio y compromisos académicos.",
			"Asistir a reuniones o citaciones de seguimiento convocadas por la institución.",
			"Garantizar en casa un ambiente favorable para el estudio y la concentración.",
			"Acompañar el cumplimiento del plan de mejoramiento definido en comisión.",
		],
		"institution_commitments": [
			"Brindar acompañamiento pedagógico y seguimiento al plan de mejoramiento.",
			"Ofrecer espacios de refuerzo y nivelación en las áreas priorizadas.",
			"Informar oportunamente a la familia sobre avances y alertas del proceso académico.",
			"Realizar seguimiento desde dirección de grupo y coordinación académica.",
		],
	}


def _format_commitments_for_observer(payload: dict[str, list[str]]) -> str:
	sections = [
		("Compromisos del estudiante", payload.get("student_commitments") or []),
		("Compromisos del acudiente", payload.get("guardian_commitments") or []),
		("Compromisos de la institución", payload.get("institution_commitments") or []),
	]

	lines: list[str] = []
	for title, items in sections:
		clean_items = [str(item).strip() for item in items if str(item).strip()]
		if not clean_items:
			continue
		lines.append(f"{title}:")
		lines.extend([f"- {item}" for item in clean_items])
		lines.append("")

	return "\n".join(lines).strip()


def _annotation_title(annotation_kind: str) -> str:
	kind = str(annotation_kind or "").strip().upper()
	if kind == ObserverAnnotation.TYPE_PRAISE:
		return "Felicitación por desempeño académico destacado"
	if kind == ObserverAnnotation.TYPE_ALERT:
		return "Llamado de atención por bajo rendimiento académico"
	return "Compromiso académico generado en comisión"


def _grade_group_label(commission: Commission) -> str:
	group = commission.group
	grade_name = getattr(getattr(group, "grade", None), "name", "") if group else ""
	group_name = getattr(group, "name", "") if group else ""
	if grade_name and group_name:
		return f"{grade_name} {group_name}"
	return grade_name or group_name or "el grupo"


def _fallback_annotation_text(annotation_kind: str, context: dict[str, Any]) -> str:
	student_name = str(context.get("student_name") or "El estudiante").strip() or "El estudiante"
	period_name = str(context.get("period_name") or "el periodo académico").strip() or "el periodo académico"
	group_label = str(context.get("group_label") or "el grupo").strip() or "el grupo"
	failed_subjects = [str(item).strip() for item in context.get("failed_subjects") or [] if str(item).strip()]
	failed_count = int(context.get("failed_count") or len(failed_subjects) or 0)
	average_label = str(context.get("average_label") or "").strip()
	highlight = str(context.get("highlight") or "").strip()
	failed_subjects_label = ", ".join(failed_subjects[:4])
	if len(failed_subjects) > 4:
		failed_subjects_label = f"{failed_subjects_label} y otras áreas priorizadas"

	kind = str(annotation_kind or "").strip().upper()
	if kind == ObserverAnnotation.TYPE_PRAISE:
		performance_label = f" con promedio {average_label}" if average_label else ""
		strength_label = f" {highlight}" if highlight else ""
		return (
			f"En la comisión de evaluación correspondiente a {period_name}, se reconoce a {student_name} por su destacado desempeño académico{performance_label} en {group_label}."
			f"{strength_label} Se felicita su constancia, responsabilidad y compromiso con el proceso formativo, invitándolo a mantener este nivel de desempeño."
		).strip()

	if kind == ObserverAnnotation.TYPE_ALERT:
		subjects_fragment = (
			f" en las asignaturas {failed_subjects_label}" if failed_subjects_label else " en varias áreas priorizadas"
		)
		return (
			f"Durante la comisión de evaluación de {period_name}, se evidencia que {student_name} presenta bajo rendimiento académico{subjects_fragment}."
			f" Se realiza un llamado de atención pedagógico para fortalecer hábitos de estudio, cumplimiento de actividades y búsqueda oportuna de apoyo docente, dado que registra {failed_count} desempeño(s) en bajo nivel."
		)

	return (
		f"Como resultado de la comisión de evaluación de {period_name}, {student_name} asume un compromiso académico de mejoramiento en {group_label}."
		" Se establecerá seguimiento conjunto entre estudiante, familia e institución para verificar avances, cumplimiento de actividades y recuperación de los aprendizajes priorizados."
	)


def _resolve_annotation_text_with_ai(annotation_kind: str, context: dict[str, Any]) -> str:
	fallback = _fallback_annotation_text(annotation_kind, context)
	ai_context = dict(context)
	ai_context["annotation_type"] = annotation_kind

	try:
		ai = AIService()
		executor = ThreadPoolExecutor(max_workers=1)
		future = executor.submit(ai.generate_commission_observer_annotation, ai_context)
		try:
			payload = future.result(timeout=_AI_TIMEOUT_SECONDS)
		finally:
			executor.shutdown(wait=False, cancel_futures=True)
	except FutureTimeoutError:
		logger.warning(
			"AI observer annotation generation timed out; using fallback",
			extra={"annotation_type": annotation_kind, "commission_id": context.get("commission_id")},
		)
		return fallback
	except AIServiceError:
		logger.warning(
			"AI observer annotation generation unavailable; using fallback",
			extra={"annotation_type": annotation_kind, "commission_id": context.get("commission_id")},
		)
		return fallback
	except Exception:
		logger.exception(
			"Unexpected error generating commission observer annotation; using fallback",
			extra={"annotation_type": annotation_kind, "commission_id": context.get("commission_id")},
		)
		return fallback

	text = str((payload or {}).get("text") or "").strip()
	return text or fallback


def _resolve_commitments_payload_with_ai(context: dict[str, Any]) -> dict[str, list[str]]:
	defaults = _default_commitments_payload()

	try:
		ai = AIService()
		executor = ThreadPoolExecutor(max_workers=1)
		future = executor.submit(ai.generate_commitments_blocks, context)
		try:
			payload = future.result(timeout=_AI_TIMEOUT_SECONDS)
		finally:
			executor.shutdown(wait=False, cancel_futures=True)
	except FutureTimeoutError:
		logger.warning(
			"AI commitments generation timed out; using defaults",
			extra={"commission_id": context.get("commission_id"), "student_id": context.get("student_id")},
		)
		return defaults
	except AIServiceError:
		logger.warning(
			"AI commitments generation unavailable; using defaults",
			extra={"commission_id": context.get("commission_id"), "student_id": context.get("student_id")},
		)
		return defaults
	except Exception:
		logger.exception(
			"Unexpected error generating commission commitments; using defaults",
			extra={"commission_id": context.get("commission_id"), "student_id": context.get("student_id")},
		)
		return defaults

	if not isinstance(payload, dict):
		return defaults

	for key in ("student_commitments", "guardian_commitments", "institution_commitments"):
		values = payload.get(key)
		if not isinstance(values, list):
			return defaults
		clean_values = [str(item).strip() for item in values if str(item).strip()]
		if not clean_values:
			return defaults
		defaults[key] = clean_values

	return defaults


def _upsert_observer_annotation(
	*,
	student_id: int,
	period_id: int,
	rule_key: str,
	annotation_type: str,
	title: str,
	text: str,
	commitments: str,
	meta: dict[str, Any],
	triggered_by,
) -> bool:
	annotation, created = ObserverAnnotation.objects.filter(
		is_deleted=False,
		student_id=student_id,
		period_id=period_id,
		rule_key=rule_key,
	).get_or_create(
		student_id=student_id,
		period_id=period_id,
		rule_key=rule_key,
		defaults={
			"annotation_type": annotation_type,
			"title": title,
			"text": text,
			"commitments": commitments,
			"created_by": triggered_by,
			"is_automatic": True,
			"meta": meta,
		}
	)

	if created:
		return True

	annotation.annotation_type = annotation_type
	annotation.title = title
	annotation.text = text
	annotation.commitments = commitments
	annotation.is_automatic = True
	annotation.meta = meta
	annotation.updated_by = triggered_by
	if annotation.created_by_id is None and triggered_by is not None:
		annotation.created_by = triggered_by
	annotation.save(
		update_fields=[
			"annotation_type",
			"title",
			"text",
			"commitments",
			"is_automatic",
			"meta",
			"created_by",
			"updated_by",
			"updated_at",
		]
	)
	return False


def generate_close_observer_annotations_for_commission(
	*,
	commission_id: int,
	closed_by_user_id: int | None = None,
) -> dict[str, Any]:
	User = get_user_model()
	commission = (
		Commission.objects.select_related(
			"period",
			"group",
			"group__grade",
			"academic_year",
			"institution",
		)
		.filter(id=int(commission_id))
		.first()
	)
	if commission is None:
		return {
			"status": "missing",
			"commission_id": int(commission_id),
			"errors": ["La comisión no existe."],
		}

	triggered_by = User.objects.filter(id=closed_by_user_id).first() if closed_by_user_id else None
	period_name = getattr(getattr(commission, "period", None), "name", "") or "cierre anual"
	group_label = _grade_group_label(commission)
	summary: dict[str, Any] = {
		"status": "completed",
		"commission_id": int(commission.id),
		"commission_title": str(getattr(commission, "title", "") or f"Comisión {commission.id}").strip(),
		"period_name": period_name,
		"group_label": group_label,
		"students_best_count": 0,
		"students_low_count": 0,
		"praise_created": 0,
		"praise_updated": 0,
		"alert_created": 0,
		"alert_updated": 0,
		"commitment_created": 0,
		"commitment_updated": 0,
		"errors": [],
	}

	if commission.commission_type != Commission.TYPE_EVALUATION or commission.period_id is None or commission.group_id is None:
		summary["status"] = "skipped"
		summary["errors"].append("La automatización solo aplica para comisiones de evaluación con periodo y grupo.")
		return summary

	performance_snapshot = build_commission_performance_snapshot(commission=commission)
	low_students = list(performance_snapshot.get("low_performance_students") or [])
	low_student_ids = {int(item.get("student_id") or 0) for item in low_students if int(item.get("student_id") or 0) > 0}
	best_students = [
		item
		for item in list(performance_snapshot.get("best_performance_students") or [])
		if int(item.get("student_id") or 0) not in low_student_ids
	]

	summary["students_best_count"] = len(best_students)
	summary["students_low_count"] = len(low_students)

	for item in best_students:
		student_id = int(item.get("student_id") or 0)
		if student_id <= 0:
			continue
		context = {
			"commission_id": int(commission.id),
			"student_id": student_id,
			"student_name": item.get("student_name", "").title(),
			"period_name": period_name,
			"group_label": group_label,
			"average_label": item.get("average_label", ""),
			"highlight": item.get("highlight", ""),
		}
		try:
			created = _upsert_observer_annotation(
				student_id=student_id,
				period_id=int(commission.period_id),
				rule_key=f"COMMISSION_CLOSE:{commission.id}:PRAISE:{student_id}",
				annotation_type=ObserverAnnotation.TYPE_PRAISE,
				title=_annotation_title(ObserverAnnotation.TYPE_PRAISE),
				text=_resolve_annotation_text_with_ai(ObserverAnnotation.TYPE_PRAISE, context),
				commitments="",
				meta={
					"commission_id": int(commission.id),
					"source": "commission_close_ai",
					"student_segment": "best_performance",
					"average_label": str(item.get("average_label") or ""),
				},
				triggered_by=triggered_by,
			)
			if created:
				summary["praise_created"] += 1
			else:
				summary["praise_updated"] += 1
		except Exception:
			logger.exception("Error generating praise observer annotation", extra={"commission_id": commission.id, "student_id": student_id})
			summary["errors"].append(f"No fue posible generar la felicitación para el estudiante {student_id}.")

	for item in low_students:
		student_id = int(item.get("student_id") or 0)
		if student_id <= 0:
			continue
		failed_subjects = [str(subject).strip() for subject in item.get("subjects") or [] if str(subject).strip()]
		context = {
			"commission_id": int(commission.id),
			"student_id": student_id,
			"student_name": item.get("student_name", "").title(),
			"period_name": period_name,
			"group_label": group_label,
			"failed_subjects": failed_subjects,
			"failed_count": int(item.get("failed_count") or len(failed_subjects) or 0),
		}
		try:
			created = _upsert_observer_annotation(
				student_id=student_id,
				period_id=int(commission.period_id),
				rule_key=f"COMMISSION_CLOSE:{commission.id}:ALERT:{student_id}",
				annotation_type=ObserverAnnotation.TYPE_ALERT,
				title=_annotation_title(ObserverAnnotation.TYPE_ALERT),
				text=_resolve_annotation_text_with_ai(ObserverAnnotation.TYPE_ALERT, context),
				commitments="",
				meta={
					"commission_id": int(commission.id),
					"source": "commission_close_ai",
					"student_segment": "low_performance",
					"failed_subjects": failed_subjects,
					"failed_count": int(context["failed_count"]),
				},
				triggered_by=triggered_by,
			)
			if created:
				summary["alert_created"] += 1
			else:
				summary["alert_updated"] += 1
		except Exception:
			logger.exception("Error generating alert observer annotation", extra={"commission_id": commission.id, "student_id": student_id})
			summary["errors"].append(f"No fue posible generar el llamado de atención para el estudiante {student_id}.")

		try:
			commitments_payload = _resolve_commitments_payload_with_ai(context)
			created = _upsert_observer_annotation(
				student_id=student_id,
				period_id=int(commission.period_id),
				rule_key=f"COMMISSION_CLOSE:{commission.id}:COMMITMENT:{student_id}",
				annotation_type=ObserverAnnotation.TYPE_COMMITMENT,
				title=_annotation_title(ObserverAnnotation.TYPE_COMMITMENT),
				text=_resolve_annotation_text_with_ai(ObserverAnnotation.TYPE_COMMITMENT, context),
				commitments=_format_commitments_for_observer(commitments_payload),
				meta={
					"commission_id": int(commission.id),
					"source": "commission_close_ai",
					"student_segment": "low_performance",
					"failed_subjects": failed_subjects,
					"failed_count": int(context["failed_count"]),
				},
				triggered_by=triggered_by,
			)
			if created:
				summary["commitment_created"] += 1
			else:
				summary["commitment_updated"] += 1
		except Exception:
			logger.exception("Error generating commitment observer annotation", extra={"commission_id": commission.id, "student_id": student_id})
			summary["errors"].append(f"No fue posible generar el compromiso para el estudiante {student_id}.")

	if summary["errors"]:
		summary["status"] = "completed_with_errors"

	return summary