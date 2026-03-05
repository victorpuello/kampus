from pathlib import Path
import os
import re
import csv
from io import StringIO

from django.utils import timezone
from datetime import timedelta
from django.db.models import Count

from django.conf import settings
from django.core.management import call_command
from django.http import HttpResponse
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User
from users.permissions import IsSuperAdmin

from communications.models import EmailDelivery
from notifications.models import Notification
from novelties.tasks import notify_novelties_sla_task
from notifications.tasks import (
	check_dispatch_outbox_health_task,
	check_notifications_health_task,
	check_whatsapp_health_task,
	process_dispatch_outbox_task,
)
from teachers.tasks import notify_pending_planning_teachers_task

from .models import PeriodicJobRun, PeriodicJobRuntimeConfig, ReportJob, ReportJobEvent
from .serializers import ReportJobCreateSerializer, ReportJobSerializer
from .tasks import _render_report_html, generate_report_job_pdf
from .weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html
from notifications.models import NotificationDispatch


def _is_admin(user: User) -> bool:
	return getattr(user, "role", None) in {User.ROLE_SUPERADMIN, User.ROLE_ADMIN}


def _safe_join_private(root: Path, relpath: str) -> Path:
	rel = Path(relpath)
	if rel.is_absolute():
		raise ValueError("Absolute paths are not allowed")

	final = (root / rel).resolve()
	root_resolved = root.resolve()
	if root_resolved not in final.parents and final != root_resolved:
		raise ValueError("Invalid path")
	return final


_CRON_BASIC_PATTERN = re.compile(r"^[0-9*/,\-]+$")


def _is_valid_cron_token(token: str, *, min_value: int, max_value: int) -> bool:
	t = token.strip()
	if not t:
		return False

	if t == "*":
		return True

	if t.startswith("*/"):
		step_raw = t[2:]
		if not step_raw.isdigit():
			return False
		step = int(step_raw)
		return step > 0

	if "/" in t:
		base, step_raw = t.split("/", 1)
		if not step_raw.isdigit():
			return False
		step = int(step_raw)
		if step <= 0:
			return False
		if "-" in base:
			start_raw, end_raw = base.split("-", 1)
			if not (start_raw.isdigit() and end_raw.isdigit()):
				return False
			start = int(start_raw)
			end = int(end_raw)
			return min_value <= start <= end <= max_value
		if base.isdigit():
			v = int(base)
			return min_value <= v <= max_value
		return False

	if "-" in t:
		start_raw, end_raw = t.split("-", 1)
		if not (start_raw.isdigit() and end_raw.isdigit()):
			return False
		start = int(start_raw)
		end = int(end_raw)
		return min_value <= start <= end <= max_value

	if t.isdigit():
		v = int(t)
		return min_value <= v <= max_value

	return False


def _is_valid_cron_field(expr: str, *, min_value: int, max_value: int) -> bool:
	value = str(expr or "").strip()
	if not value:
		return False
	if not _CRON_BASIC_PATTERN.match(value):
		return False

	tokens = [token.strip() for token in value.split(",")]
	if not tokens:
		return False

	for token in tokens:
		if not _is_valid_cron_token(token, min_value=min_value, max_value=max_value):
			return False
	return True


def _build_periodic_jobs_snapshot() -> list[dict]:
	jobs = [
		{
			"key": "notify-novelties-sla",
			"task": "novelties.notify_novelties_sla",
			"editable_params": ["dedupe_within_seconds"],
			"default_params": {
				"dedupe_within_seconds": int(os.getenv("KAMPUS_NOVELTIES_SLA_DEDUPE_WITHIN_SECONDS", "90000")),
			},
			"default_enabled": bool(
				getattr(settings, "KAMPUS_NOVELTIES_SLA_NOTIFY_ENABLED", False)
				and getattr(settings, "KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_ENABLED", False)
			),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_MINUTE", 0),
				"hour": getattr(settings, "KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_HOUR", 8),
				"day_of_week": getattr(settings, "KAMPUS_NOVELTIES_SLA_NOTIFY_BEAT_DAY_OF_WEEK", "1-5"),
			},
		},
		{
			"key": "check-notifications-health",
			"task": "notifications.check_notifications_health",
			"editable_params": ["max_failed", "max_suppressed"],
			"default_params": {
				"max_failed": int(os.getenv("KAMPUS_NOTIFICATIONS_ALERT_MAX_FAILED", "10")),
				"max_suppressed": int(os.getenv("KAMPUS_NOTIFICATIONS_ALERT_MAX_SUPPRESSED", "50")),
			},
			"default_enabled": bool(getattr(settings, "KAMPUS_NOTIFICATIONS_HEALTH_BEAT_ENABLED", False)),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_NOTIFICATIONS_HEALTH_BEAT_MINUTE", 15),
				"hour": getattr(settings, "KAMPUS_NOTIFICATIONS_HEALTH_BEAT_HOUR", "*"),
				"day_of_week": getattr(settings, "KAMPUS_NOTIFICATIONS_HEALTH_BEAT_DAY_OF_WEEK", "1-5"),
			},
		},
		{
			"key": "check-whatsapp-health",
			"task": "notifications.check_whatsapp_health",
			"editable_params": [],
			"default_params": {},
			"default_enabled": bool(getattr(settings, "KAMPUS_WHATSAPP_HEALTH_BEAT_ENABLED", False)),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_WHATSAPP_HEALTH_BEAT_MINUTE", "30"),
				"hour": getattr(settings, "KAMPUS_WHATSAPP_HEALTH_BEAT_HOUR", "*"),
				"day_of_week": getattr(settings, "KAMPUS_WHATSAPP_HEALTH_BEAT_DAY_OF_WEEK", "1-5"),
			},
		},
		{
			"key": "process-notification-dispatch-outbox",
			"task": "notifications.process_dispatch_outbox",
			"editable_params": ["batch_size", "max_retries"],
			"default_params": {
				"batch_size": int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BATCH_SIZE", "100")),
				"max_retries": int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_MAX_RETRIES", "5")),
			},
			"default_enabled": bool(getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_ENABLED", False)),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_MINUTE", "*/2"),
				"hour": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_HOUR", "*"),
				"day_of_week": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_OUTBOX_BEAT_DAY_OF_WEEK", "*"),
			},
		},
		{
			"key": "check-dispatch-outbox-health",
			"task": "notifications.check_dispatch_outbox_health",
			"editable_params": ["max_pending", "max_failed", "max_oldest_pending_age_seconds"],
			"default_params": {
				"max_pending": int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_PENDING", "500")),
				"max_failed": int(os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_FAILED", "100")),
				"max_oldest_pending_age_seconds": int(
					os.getenv("KAMPUS_NOTIFICATIONS_DISPATCH_ALERT_MAX_OLDEST_PENDING_AGE_SECONDS", "900")
				),
			},
			"default_enabled": bool(getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_ENABLED", False)),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_MINUTE", "*/5"),
				"hour": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_HOUR", "*"),
				"day_of_week": getattr(settings, "KAMPUS_NOTIFICATIONS_DISPATCH_HEALTH_BEAT_DAY_OF_WEEK", "*"),
			},
		},
		{
			"key": "notify-pending-planning-teachers",
			"task": "teachers.notify_pending_planning_teachers",
			"editable_params": ["dedupe_within_seconds"],
			"default_params": {
				"dedupe_within_seconds": int(os.getenv("KAMPUS_PLANNING_REMINDER_DEDUPE_SECONDS", "86400")),
			},
			"default_enabled": bool(
				getattr(settings, "KAMPUS_PLANNING_REMINDER_ENABLED", False)
				and getattr(settings, "KAMPUS_PLANNING_REMINDER_BEAT_ENABLED", False)
			),
			"schedule": {
				"minute": getattr(settings, "KAMPUS_PLANNING_REMINDER_BEAT_MINUTE", 0),
				"hour": getattr(settings, "KAMPUS_PLANNING_REMINDER_BEAT_HOUR", 7),
				"day_of_week": getattr(settings, "KAMPUS_PLANNING_REMINDER_BEAT_DAY_OF_WEEK", "1-5"),
			},
		},
	]

	overrides = {
		obj.job_key: {
			"enabled_override": obj.enabled_override,
			"params_override": obj.params_override or {},
			"schedule_override": obj.schedule_override or {},
		}
		for obj in PeriodicJobRuntimeConfig.objects.filter(job_key__in=[j["key"] for j in jobs])
	}

	for job in jobs:
		override_entry = overrides.get(job["key"], None) or {}
		enabled_override = override_entry.get("enabled_override", None)
		params_override = override_entry.get("params_override", {})
		schedule_override = override_entry.get("schedule_override", {})
		job["enabled_override"] = enabled_override
		job["enabled"] = bool(job["default_enabled"] if enabled_override is None else enabled_override)
		job["params_override"] = params_override
		job["schedule_override"] = schedule_override

		effective_params = dict(job.get("default_params") or {})
		effective_params.update(params_override)
		job["effective_params"] = effective_params

		effective_schedule = dict(job.get("schedule") or {})
		effective_schedule.update(
			{k: v for k, v in schedule_override.items() if k in {"minute", "hour", "day_of_week"}}
		)
		job["effective_schedule"] = effective_schedule
		job["scheduler_restart_required"] = bool(schedule_override)

	return jobs


class OperationsJobsOverviewAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	def get(self, request, *args, **kwargs):
		now = timezone.now()
		window_start = now - timedelta(hours=24)

		report_counts_raw = (
			ReportJob.objects.filter(created_at__gte=window_start)
			.values("status")
			.annotate(total=Count("id"))
		)
		report_counts = {row["status"]: row["total"] for row in report_counts_raw}

		email_counts_raw = (
			EmailDelivery.objects.filter(created_at__gte=window_start)
			.values("status")
			.annotate(total=Count("id"))
		)
		email_counts = {row["status"]: row["total"] for row in email_counts_raw}

		notifications_created = Notification.objects.filter(created_at__gte=window_start).count()
		notifications_unread = Notification.objects.filter(read_at__isnull=True).count()

		recent_report_runs = [
			{
				"id": job.id,
				"source": "report",
				"report_type": job.report_type,
				"status": job.status,
				"created_at": job.created_at,
				"finished_at": job.finished_at,
				"created_by": job.created_by_id,
			}
			for job in ReportJob.objects.select_related("created_by").order_by("-created_at")[:10]
		]
		recent_periodic_runs = [
			{
				"id": run.id,
				"source": "periodic",
				"report_type": run.job_key,
				"status": run.status,
				"created_at": run.created_at,
				"finished_at": run.finished_at,
				"created_by": run.triggered_by_id,
			}
			for run in PeriodicJobRun.objects.select_related("triggered_by").order_by("-created_at")[:10]
		]

		latest_runs = sorted(
			recent_report_runs + recent_periodic_runs,
			key=lambda run: run["created_at"],
			reverse=True,
		)[:10]

		return Response(
			{
				"window_hours": 24,
				"generated_at": now,
				"report_jobs": {
					"counts_by_status": report_counts,
					"running": report_counts.get(ReportJob.Status.RUNNING, 0),
					"failed": report_counts.get(ReportJob.Status.FAILED, 0),
				},
				"notifications": {
					"created_last_24h": notifications_created,
					"unread_total": notifications_unread,
				},
				"email_delivery": {
					"counts_by_status": email_counts,
					"failed": email_counts.get(EmailDelivery.STATUS_FAILED, 0),
					"suppressed": email_counts.get(EmailDelivery.STATUS_SUPPRESSED, 0),
				},
				"periodic_jobs": _build_periodic_jobs_snapshot(),
				"latest_runs": latest_runs,
			}
		)


class OperationsRunNowAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	TASK_DISPATCH = {
		"notify-novelties-sla": notify_novelties_sla_task,
		"check-notifications-health": check_notifications_health_task,
		"check-whatsapp-health": check_whatsapp_health_task,
		"process-notification-dispatch-outbox": process_dispatch_outbox_task,
		"check-dispatch-outbox-health": check_dispatch_outbox_health_task,
		"notify-pending-planning-teachers": notify_pending_planning_teachers_task,
	}

	def post(self, request, *args, **kwargs):
		job_key = (request.data.get("job_key") or "").strip()
		periodic_jobs = {job["key"]: job for job in _build_periodic_jobs_snapshot()}
		job_meta = periodic_jobs.get(job_key)
		if job_meta and job_meta.get("enabled_override") is False:
			return Response(
				{"detail": "El job está pausado. Reanúdalo antes de ejecutarlo manualmente."},
				status=status.HTTP_409_CONFLICT,
			)

		task_fn = self.TASK_DISPATCH.get(job_key)
		if task_fn is None:
			return Response(
				{
					"detail": "job_key no soportado.",
					"supported_job_keys": sorted(self.TASK_DISPATCH.keys()),
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		running = PeriodicJobRun.objects.filter(
			job_key=job_key,
			status=PeriodicJobRun.Status.RUNNING,
		).exists()
		if running:
			return Response(
				{"detail": "Ya existe una ejecución RUNNING para este job_key."},
				status=status.HTTP_409_CONFLICT,
			)

		run = PeriodicJobRun.objects.create(
			job_key=job_key,
			task_name=task_fn.name,
			triggered_by=request.user if request.user.is_authenticated else None,
		)
		result = task_fn.delay(periodic_run_id=run.id)
		run.celery_task_id = str(getattr(result, "id", "") or "")
		run.save(update_fields=["celery_task_id"])
		return Response(
			{
				"job_key": job_key,
				"task": task_fn.name,
				"task_id": str(getattr(result, "id", "")),
				"run_id": run.id,
				"dispatched": True,
			},
			status=status.HTTP_202_ACCEPTED,
		)


class OperationsRunLogsAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	def get(self, request, job_id: int, *args, **kwargs):
		job = ReportJob.objects.filter(id=job_id).first()
		if job is None:
			return Response({"detail": "Ejecución no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		events = list(
			ReportJobEvent.objects.filter(job_id=job.id)
			.order_by("-created_at", "-id")[:50]
			.values("id", "created_at", "event_type", "level", "message", "meta")
		)

		return Response(
			{
				"run": {
					"id": job.id,
					"report_type": job.report_type,
					"status": job.status,
					"created_at": job.created_at,
					"started_at": job.started_at,
					"finished_at": job.finished_at,
					"error_code": job.error_code,
					"error_message": job.error_message,
				},
				"events": events,
			}
		)


class OperationsPeriodicRunLogsAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	def get(self, request, run_id: int, *args, **kwargs):
		run = PeriodicJobRun.objects.filter(id=run_id).first()
		if run is None:
			return Response({"detail": "Ejecución no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		events: list[dict] = []
		if run.started_at:
			events.append(
				{
					"id": -1,
					"created_at": run.started_at,
					"event_type": "RUNNING",
					"level": "INFO",
					"message": "Ejecución iniciada",
					"meta": {},
				}
			)
		if run.output_text:
			events.append(
				{
					"id": -2,
					"created_at": run.finished_at or run.created_at,
					"event_type": "OUTPUT",
					"level": "INFO",
					"message": run.output_text,
					"meta": {},
				}
			)
		if run.error_message:
			events.append(
				{
					"id": -3,
					"created_at": run.finished_at or run.created_at,
					"event_type": "FAILED",
					"level": "ERROR",
					"message": run.error_message,
					"meta": {},
				}
			)

		return Response(
			{
				"run": {
					"id": run.id,
					"report_type": run.job_key,
					"status": run.status,
					"created_at": run.created_at,
					"started_at": run.started_at,
					"finished_at": run.finished_at,
					"error_code": "PERIODIC_JOB_ERROR" if run.error_message else None,
					"error_message": run.error_message or None,
				},
				"events": events,
			}
		)


class OperationsPeriodicJobToggleAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	ALLOWED_JOB_KEYS = {
		"notify-novelties-sla",
		"check-notifications-health",
		"check-whatsapp-health",
		"process-notification-dispatch-outbox",
		"check-dispatch-outbox-health",
		"notify-pending-planning-teachers",
	}

	def post(self, request, *args, **kwargs):
		job_key = (request.data.get("job_key") or "").strip()
		enabled = request.data.get("enabled", None)

		if job_key not in self.ALLOWED_JOB_KEYS:
			return Response(
				{
					"detail": "job_key no soportado.",
					"supported_job_keys": sorted(self.ALLOWED_JOB_KEYS),
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		if not isinstance(enabled, bool):
			return Response(
				{"detail": "El campo 'enabled' es obligatorio y debe ser booleano."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		obj, _created = PeriodicJobRuntimeConfig.objects.update_or_create(
			job_key=job_key,
			defaults={"enabled_override": enabled},
		)

		return Response(
			{
				"job_key": obj.job_key,
				"enabled": bool(obj.enabled_override),
				"enabled_override": obj.enabled_override,
				"updated_at": obj.updated_at,
			},
			status=status.HTTP_200_OK,
		)


class OperationsPeriodicJobParamsAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	PARAM_SCHEMA = {
		"notify-novelties-sla": {"dedupe_within_seconds": {"type": int, "min": 0, "max": 604800}},
		"check-notifications-health": {
			"max_failed": {"type": int, "min": 0, "max": 100000},
			"max_suppressed": {"type": int, "min": 0, "max": 100000},
		},
		"process-notification-dispatch-outbox": {
			"batch_size": {"type": int, "min": 1, "max": 10000},
			"max_retries": {"type": int, "min": 1, "max": 100},
		},
		"check-dispatch-outbox-health": {
			"max_pending": {"type": int, "min": 0, "max": 1000000},
			"max_failed": {"type": int, "min": 0, "max": 1000000},
			"max_dead_letter": {"type": int, "min": 0, "max": 1000000},
			"max_oldest_pending_age_seconds": {"type": int, "min": 0, "max": 604800},
		},
		"notify-pending-planning-teachers": {"dedupe_within_seconds": {"type": int, "min": 0, "max": 604800}},
	}

	def post(self, request, *args, **kwargs):
		job_key = (request.data.get("job_key") or "").strip()
		params = request.data.get("params") or {}

		if job_key not in self.PARAM_SCHEMA:
			return Response(
				{
					"detail": "job_key no soportado para edición de parámetros.",
					"supported_job_keys": sorted(self.PARAM_SCHEMA.keys()),
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		if not isinstance(params, dict):
			return Response(
				{"detail": "El campo 'params' debe ser un objeto JSON."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		schema = self.PARAM_SCHEMA[job_key]
		clean_params: dict[str, int] = {}
		for key, value in params.items():
			if key not in schema:
				return Response(
					{"detail": f"Parámetro no soportado: {key}."},
					status=status.HTTP_400_BAD_REQUEST,
				)

			rules = schema[key]
			if not isinstance(value, rules["type"]):
				return Response(
					{"detail": f"El parámetro {key} debe ser entero."},
					status=status.HTTP_400_BAD_REQUEST,
				)

			if value < rules["min"] or value > rules["max"]:
				return Response(
					{
						"detail": (
							f"El parámetro {key} debe estar entre {rules['min']} y {rules['max']}."
						)
					},
					status=status.HTTP_400_BAD_REQUEST,
				)
			clean_params[key] = int(value)

		obj, _created = PeriodicJobRuntimeConfig.objects.get_or_create(job_key=job_key)
		obj.params_override = {**(obj.params_override or {}), **clean_params}
		obj.save(update_fields=["params_override", "updated_at"])

		return Response(
			{
				"job_key": obj.job_key,
				"params_override": obj.params_override,
				"updated_at": obj.updated_at,
			},
			status=status.HTTP_200_OK,
		)


class OperationsPeriodicJobScheduleAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	ALLOWED_JOB_KEYS = {
		"notify-novelties-sla",
		"check-notifications-health",
		"check-whatsapp-health",
		"process-notification-dispatch-outbox",
		"check-dispatch-outbox-health",
		"notify-pending-planning-teachers",
	}

	def post(self, request, *args, **kwargs):
		job_key = (request.data.get("job_key") or "").strip()
		schedule = request.data.get("schedule") or {}

		if job_key not in self.ALLOWED_JOB_KEYS:
			return Response(
				{
					"detail": "job_key no soportado para edición de schedule.",
					"supported_job_keys": sorted(self.ALLOWED_JOB_KEYS),
				},
				status=status.HTTP_400_BAD_REQUEST,
			)

		if not isinstance(schedule, dict):
			return Response(
				{"detail": "El campo 'schedule' debe ser un objeto JSON."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		minute = schedule.get("minute")
		hour = schedule.get("hour")
		day_of_week = schedule.get("day_of_week")

		if not isinstance(minute, str) or not minute.strip():
			return Response(
				{"detail": "schedule.minute es requerido y debe ser texto cron válido."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if not isinstance(hour, str) or not hour.strip():
			return Response(
				{"detail": "schedule.hour es requerido y debe ser texto cron válido."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if not isinstance(day_of_week, str) or not day_of_week.strip():
			return Response(
				{"detail": "schedule.day_of_week es requerido y debe ser texto cron válido."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		if not _is_valid_cron_field(minute, min_value=0, max_value=59):
			return Response(
				{"detail": "schedule.minute inválido. Usa cron: 0-59, *, rangos, listas y pasos."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if not _is_valid_cron_field(hour, min_value=0, max_value=23):
			return Response(
				{"detail": "schedule.hour inválido. Usa cron: 0-23, *, rangos, listas y pasos."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if not _is_valid_cron_field(day_of_week, min_value=0, max_value=7):
			return Response(
				{"detail": "schedule.day_of_week inválido. Usa cron: 0-7, *, rangos, listas y pasos."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		clean_schedule = {
			"minute": minute.strip(),
			"hour": hour.strip(),
			"day_of_week": day_of_week.strip(),
		}

		obj, _created = PeriodicJobRuntimeConfig.objects.get_or_create(job_key=job_key)
		obj.schedule_override = clean_schedule
		obj.save(update_fields=["schedule_override", "updated_at"])

		return Response(
			{
				"job_key": obj.job_key,
				"schedule_override": obj.schedule_override,
				"updated_at": obj.updated_at,
				"scheduler_restart_required": True,
			},
			status=status.HTTP_200_OK,
		)


class OperationsDispatchRetryFailedAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	def post(self, request, *args, **kwargs):
		channel = str(request.data.get("channel") or "").strip().upper()
		limit = request.data.get("limit", 100)
		try:
			limit_int = max(1, int(limit))
		except (TypeError, ValueError):
			return Response({"detail": "limit debe ser entero"}, status=status.HTTP_400_BAD_REQUEST)

		if channel and channel not in {
			NotificationDispatch.CHANNEL_EMAIL,
			NotificationDispatch.CHANNEL_WHATSAPP,
		}:
			return Response({"detail": "channel inválido"}, status=status.HTTP_400_BAD_REQUEST)

		buffer = StringIO()
		call_command(
			"retry_notification_dispatches",
			channel=channel,
			limit=limit_int,
			stdout=buffer,
		)
		return Response(
			{
				"detail": "Retry ejecutado",
				"channel": channel or "ALL",
				"limit": limit_int,
				"output": buffer.getvalue().strip(),
			},
			status=status.HTTP_200_OK,
		)


class OperationsDispatchExportAPIView(APIView):
	permission_classes = [IsSuperAdmin]

	def get(self, request, *args, **kwargs):
		status_filter = str(request.query_params.get("status") or "").strip().upper()
		channel_filter = str(request.query_params.get("channel") or "").strip().upper()

		qs = NotificationDispatch.objects.select_related("notification", "notification__recipient").order_by("-created_at")
		if status_filter:
			qs = qs.filter(status=status_filter)
		if channel_filter:
			qs = qs.filter(channel=channel_filter)

		response = HttpResponse(content_type="text/csv")
		response["Content-Disposition"] = "attachment; filename=notification_dispatches.csv"
		writer = csv.writer(response)
		writer.writerow(
			[
				"id",
				"notification_id",
				"recipient_id",
				"channel",
				"status",
				"attempts",
				"idempotency_key",
				"next_retry_at",
				"error_message",
				"created_at",
				"updated_at",
			]
		)

		for row in qs[:10000]:
			writer.writerow(
				[
					row.id,
					row.notification_id,
					row.notification.recipient_id,
					row.channel,
					row.status,
					row.attempts,
					row.idempotency_key,
					row.next_retry_at.isoformat() if row.next_retry_at else "",
					row.error_message,
					row.created_at.isoformat() if row.created_at else "",
					row.updated_at.isoformat() if row.updated_at else "",
				]
			)

		return response


class PdfHealthcheckAPIView(APIView):
	permission_classes = [IsAuthenticated]

	def get(self, request, *args, **kwargs):
		user = request.user
		if not (_is_admin(user) or getattr(user, "is_staff", False)):
			return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

		health_html = "<html><body><h1>healthcheck</h1><p>reports.pdf.ok</p></body></html>"
		try:
			pdf_bytes = render_pdf_bytes_from_html(html=health_html, base_url=str(settings.BASE_DIR))
		except WeasyPrintUnavailableError as exc:
			return Response(
				{
					"ok": False,
					"service": "pdf_render",
					"detail": str(exc),
				},
				status=status.HTTP_503_SERVICE_UNAVAILABLE,
			)
		except Exception as exc:
			return Response(
				{
					"ok": False,
					"service": "pdf_render",
					"detail": str(exc),
				},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR,
			)

		if not pdf_bytes:
			return Response(
				{
					"ok": False,
					"service": "pdf_render",
					"detail": "PDF vacío generado.",
				},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR,
			)

		return Response(
			{
				"ok": True,
				"service": "pdf_render",
				"bytes": len(pdf_bytes),
			},
			status=status.HTTP_200_OK,
		)


class ReportJobViewSet(viewsets.ModelViewSet):
	permission_classes = [IsAuthenticated]
	queryset = ReportJob.objects.select_related("created_by").order_by("-created_at")

	def get_queryset(self):
		qs = super().get_queryset()
		user = self.request.user
		if _is_admin(user) or getattr(user, "is_staff", False):
			return qs
		return qs.filter(created_by=user)

	def get_serializer_class(self):
		if self.action == "create":
			return ReportJobCreateSerializer
		return ReportJobSerializer

	def create(self, request, *args, **kwargs):
		# Basic rate limiting / safety caps
		user = request.user
		is_admin_like = _is_admin(user) or getattr(user, "is_staff", False)
		active_statuses = {ReportJob.Status.PENDING, ReportJob.Status.RUNNING}

		max_active = int(getattr(settings, "REPORT_JOBS_MAX_ACTIVE_PER_USER", 3))
		max_active_admin = int(getattr(settings, "REPORT_JOBS_MAX_ACTIVE_PER_ADMIN", 20))
		active_limit = max_active_admin if is_admin_like else max_active
		active_count = ReportJob.objects.filter(created_by=user, status__in=active_statuses).count()
		if active_count >= active_limit:
			return Response(
				{
					"detail": "Tienes demasiados reportes en cola. Espera a que terminen e intenta de nuevo.",
					"max_active": active_limit,
					"active": active_count,
				},
				status=status.HTTP_429_TOO_MANY_REQUESTS,
			)

		max_per_hour = int(getattr(settings, "REPORT_JOBS_MAX_CREATED_PER_HOUR", 30))
		max_per_hour_admin = int(getattr(settings, "REPORT_JOBS_MAX_CREATED_PER_HOUR_ADMIN", 300))
		per_hour_limit = max_per_hour_admin if is_admin_like else max_per_hour
		since = timezone.now() - timedelta(hours=1)
		created_last_hour = ReportJob.objects.filter(created_by=user, created_at__gte=since).count()
		if created_last_hour >= per_hour_limit:
			return Response(
				{
					"detail": "Has generado muchos reportes recientemente. Intenta de nuevo más tarde.",
					"max_per_hour": per_hour_limit,
					"created_last_hour": created_last_hour,
				},
				status=status.HTTP_429_TOO_MANY_REQUESTS,
			)

		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		ttl_hours = int(getattr(settings, "REPORT_JOBS_TTL_HOURS", 24))
		expires_at = timezone.now() + timedelta(hours=ttl_hours)

		params = serializer.validated_data.get("params") or {}
		# Ensure report templates can embed absolute public URLs (QR codes need scheme+host).
		# Celery workers do not have access to the incoming request, so we persist a safe base.
		# Prefer explicit PUBLIC_SITE_URL when configured; otherwise fall back to request.build_absolute_uri.
		public_base = (getattr(settings, "PUBLIC_SITE_URL", "") or "").strip().rstrip("/")
		if not public_base:
			try:
				public_base = request.build_absolute_uri("/").strip().rstrip("/")
			except Exception:
				public_base = ""
		if public_base:
			params = {**params, "public_site_url": public_base}

		job = ReportJob.objects.create(
			created_by=user,
			report_type=serializer.validated_data["report_type"],
			params=params,
			expires_at=expires_at,
		)

		# Enqueue async generation
		generate_report_job_pdf.delay(job.id)

		out = ReportJobSerializer(job, context={"request": request}).data
		return Response(out, status=status.HTTP_202_ACCEPTED)

	@action(detail=True, methods=["post"], url_path="cancel")
	def cancel(self, request, pk=None):
		job: ReportJob = self.get_object()
		if job.status in {ReportJob.Status.SUCCEEDED, ReportJob.Status.FAILED}:
			return Response(
				{"detail": "El reporte ya terminó y no se puede cancelar."},
				status=status.HTTP_409_CONFLICT,
			)

		job.mark_canceled()

		out = ReportJobSerializer(job, context={"request": request}).data
		return Response(out, status=status.HTTP_200_OK)

	@action(detail=True, methods=["get"], url_path="download")
	def download(self, request, pk=None):
		job: ReportJob = self.get_object()

		if job.status != ReportJob.Status.SUCCEEDED or not job.output_relpath:
			return Response(
				{"detail": "El reporte no está listo para descargar."},
				status=status.HTTP_409_CONFLICT,
			)

		base_root = Path(settings.PRIVATE_STORAGE_ROOT)
		try:
			abs_path = _safe_join_private(base_root, job.output_relpath)
		except ValueError:
			return Response({"detail": "Ruta inválida."}, status=status.HTTP_400_BAD_REQUEST)

		if not abs_path.exists():
			return Response({"detail": "Archivo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		filename = job.output_filename or abs_path.name
		resp = FileResponse(open(abs_path, "rb"), content_type=job.output_content_type)
		resp["Content-Disposition"] = f'attachment; filename="{filename}"'
		return resp

	@action(detail=True, methods=["get"], url_path="preview")
	def preview(self, request, pk=None):
		"""Return the rendered HTML for a report job.

		This is intended for CSS/template development: it lets you open the report
		in a browser and iterate quickly without waiting for PDF rendering.
		"""
		job: ReportJob = self.get_object()
		# Backfill the public base URL for older jobs so QR codes render as full URLs.
		try:
			params = job.params or {}
			if not (params.get("public_site_url") or "").strip():
				public_base = (getattr(settings, "PUBLIC_SITE_URL", "") or "").strip().rstrip("/")
				if not public_base:
					public_base = request.build_absolute_uri("/").strip().rstrip("/")
				if public_base:
					job.params = {**params, "public_site_url": public_base}
					job.save(update_fields=["params"])
		except Exception:
			# Best-effort only.
			pass
		try:
			html = _render_report_html(job)
		except Exception as exc:  # noqa: BLE001
			payload = {"detail": "Error renderizando HTML del reporte", "error": str(exc)}
			if getattr(settings, "DEBUG", False):
				import traceback as _traceback  # noqa: PLC0415

				payload["traceback"] = _traceback.format_exc()
			return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		filename = (job.output_filename or f"reporte-{job.id}.pdf").rsplit(".", 1)[0] + ".html"
		resp = HttpResponse(html, content_type="text/html; charset=utf-8")
		resp["Content-Disposition"] = f'inline; filename="{filename}"'
		resp["X-Robots-Tag"] = "noindex"
		return resp
