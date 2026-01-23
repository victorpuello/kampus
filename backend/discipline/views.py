from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework import renderers
from rest_framework.response import Response

from academic.models import AcademicYear, Group, TeacherAssignment
from core.models import Institution
from core.permissions import KampusModelPermissions
from notifications.services import create_notification
from students.models import FamilyMember

from django.contrib.auth import get_user_model

from audit.services import log_event

from .sealing import compute_case_seal_hash

from .reports import build_case_acta_context

from .models import (
	DisciplineCase,
	DisciplineCaseAttachment,
	DisciplineCaseEvent,
	DisciplineCaseNotificationLog,
	DisciplineCaseParticipant,
)
from .serializers import (
	CaseAddAttachmentSerializer,
	CaseAddNoteSerializer,
	CaseAddParticipantSerializer,
	CaseDecideSerializer,
	CaseNotifyGuardianSerializer,
	CaseRecordDescargosSerializer,
	CaseSetDescargosDeadlineSerializer,
	DisciplineCaseCreateSerializer,
	DisciplineCaseDetailSerializer,
	DisciplineCaseListSerializer,
)
class PDFRenderer(renderers.BaseRenderer):
	media_type = "application/pdf"
	format = "pdf"
	charset = None

	def render(self, data, accepted_media_type=None, renderer_context=None):
		# This renderer is used mainly to satisfy DRF content negotiation for
		# endpoints that return an HttpResponse with application/pdf.
		return data


class DisciplineCaseViewSet(viewsets.ModelViewSet):
	queryset = (
		DisciplineCase.objects.select_related(
			"student",
			"student__user",
			"enrollment",
			"enrollment__group",
			"enrollment__academic_year",
		)
		.prefetch_related(
			"participants",
			"participants__student",
			"participants__student__user",
			"attachments",
			"events",
			"notification_logs",
		)
		.all()
		.order_by("-occurred_at", "-id")
	)
	permission_classes = [KampusModelPermissions]

	def get_permissions(self):
		# Portal acudiente (P0): permitir endpoints de lectura y enterado autenticado
		# y controlar acceso real vía get_queryset() + validaciones en la acción.
		if self.action in {"list", "retrieve", "acta", "acknowledge_guardian", "close"}:
			return [IsAuthenticated()]
		return super().get_permissions()

	def get_serializer_class(self):
		if self.action == "create":
			return DisciplineCaseCreateSerializer
		if self.action == "list":
			return DisciplineCaseListSerializer
		return DisciplineCaseDetailSerializer

	def get_queryset(self):
		qs = super().get_queryset()
		user = getattr(self.request, "user", None)
		role = getattr(user, "role", None)

		if role == "TEACHER":
			active_year = AcademicYear.objects.filter(status="ACTIVE").first()
			directed_groups = Group.objects.filter(director=user)
			if active_year:
				directed_groups = directed_groups.filter(academic_year=active_year)

			if active_year:
				assigned_group_ids = set(
					TeacherAssignment.objects.filter(teacher=user, academic_year=active_year).values_list(
						"group_id", flat=True
					)
				)
			else:
				assigned_group_ids = set(
					TeacherAssignment.objects.filter(teacher=user).values_list("group_id", flat=True)
				)

			allowed_group_ids = set(directed_groups.values_list("id", flat=True)) | assigned_group_ids
			if not allowed_group_ids:
				return qs.none()
			qs = qs.filter(enrollment__group_id__in=allowed_group_ids, enrollment__status="ACTIVE").distinct()

		elif role in {"ADMIN", "SUPERADMIN", "COORDINATOR"}:
			qs = qs

		elif role == "PARENT":
			qs = qs.filter(student__family_members__user=user).distinct()

		else:
			return qs.none()

		# Optional filters (MVP)
		student_param = self.request.query_params.get("student")
		enrollment_param = self.request.query_params.get("enrollment")
		status_param = self.request.query_params.get("status")

		if student_param:
			try:
				qs = qs.filter(student_id=int(student_param))
			except (TypeError, ValueError):
				pass

		if enrollment_param:
			try:
				qs = qs.filter(enrollment_id=int(enrollment_param))
			except (TypeError, ValueError):
				pass

		if status_param:
			qs = qs.filter(status=status_param)

		return qs

	def perform_create(self, serializer):
		user = getattr(self.request, "user", None)
		role = getattr(user, "role", None)
		if role == "PARENT":
			raise PermissionDenied("No tienes permisos para crear casos.")

		with transaction.atomic():
			case: DisciplineCase = serializer.save()

			# Auto-notify group director + admins (ADMIN/SUPERADMIN only)
			notified_director = False
			notified_admins = 0
			director_user = None
			try:
				group = getattr(getattr(case, "enrollment", None), "group", None)
				director_user = getattr(group, "director", None) if group else None
			except Exception:
				director_user = None

			if director_user is not None and getattr(director_user, "is_active", False):
				if getattr(director_user, "id", None) != getattr(user, "id", None):
					create_notification(
						recipient=director_user,
						title=f"Observador: Nuevo caso disciplinario #{case.id}",
						body="Se registró un nuevo caso de convivencia para un estudiante de tu grupo.",
						url=f"/discipline/cases/{case.id}",
						type="DISCIPLINE_CASE",
						dedupe_key=f"DISCIPLINE_CASE_CREATED:case={case.id}:user={director_user.id}",
						dedupe_within_seconds=60,
					)
					notified_director = True

			User = get_user_model()
			admin_users = list(
				User.objects.filter(role__in=["ADMIN", "SUPERADMIN"], is_active=True)
				.exclude(id=getattr(user, "id", None))
			)
			if director_user is not None:
				admin_users = [u for u in admin_users if u.id != getattr(director_user, "id", None)]
			for admin_user in admin_users:
				create_notification(
					recipient=admin_user,
					title=f"Observador: Nuevo caso disciplinario #{case.id}",
					body="Se registró un nuevo caso de convivencia.",
					url=f"/discipline/cases/{case.id}",
					type="DISCIPLINE_CASE",
					dedupe_key=f"DISCIPLINE_CASE_CREATED:case={case.id}:user={admin_user.id}",
					dedupe_within_seconds=60,
				)
			notified_admins = len(admin_users)

			if notified_director or notified_admins:
				DisciplineCaseEvent.objects.create(
					case=case,
					event_type=DisciplineCaseEvent.Type.NOTE,
					text=f"Notificación automática enviada. Director: {'sí' if notified_director else 'no'}. Admins: {notified_admins}.",
					created_by=user if getattr(user, "is_authenticated", False) else None,
				)

			log_event(
				self.request,
				event_type="DISCIPLINE_CASE_CREATE",
				object_type="discipline_case",
				object_id=case.id,
				status_code=201,
				metadata={
					"notified_director": notified_director,
					"notified_admins": notified_admins,
				},
			)

	def destroy(self, request, *args, **kwargs):
		case: DisciplineCase = self.get_object()
		user = getattr(request, "user", None)
		role = getattr(user, "role", None)
		if role == "PARENT":
			raise PermissionDenied("No tienes permisos para eliminar este caso.")
		if role == "TEACHER" and case.created_by_id != getattr(user, "id", None):
			raise PermissionDenied("No tienes permisos para eliminar este caso.")
		self._ensure_not_sealed(case)
		return super().destroy(request, *args, **kwargs)

	def perform_update(self, serializer):
		# MVP: Teachers can only update their own cases, except group directors.
		user = getattr(self.request, "user", None)
		role = getattr(user, "role", None)
		instance: DisciplineCase = self.get_object()
		if role == "PARENT":
			raise PermissionDenied("No tienes permisos para editar este caso.")
		if instance.sealed_at is not None:
			raise PermissionDenied("El caso está sellado y no permite modificaciones.")
		if role == "TEACHER" and instance.created_by_id != getattr(user, "id", None) and not self._is_group_director(user, instance):
			raise PermissionDenied("No tienes permisos para editar este caso.")
		serializer.save()
		log_event(
			self.request,
			event_type="DISCIPLINE_CASE_UPDATE",
			object_type="discipline_case",
			object_id=instance.id,
			status_code=200,
		)

	def retrieve(self, request, *args, **kwargs):
		case: DisciplineCase = self.get_object()
		serializer = self.get_serializer(case)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_VIEW",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
			metadata={"status": case.status},
		)
		return Response(serializer.data)

	def _ensure_not_sealed(self, case: DisciplineCase):
		if case.sealed_at is not None:
			raise PermissionDenied("El caso está sellado y no permite modificaciones.")

	def _is_group_director(self, user, case: DisciplineCase) -> bool:
		user_id = getattr(user, "id", None)
		if not user_id:
			return False
		try:
			group = getattr(getattr(case, "enrollment", None), "group", None)
			director_id = getattr(group, "director_id", None)
			return director_id == user_id
		except Exception:
			return False

	def _ensure_can_mutate(self, request, case: DisciplineCase | None = None):
		user = getattr(request, "user", None)
		role = getattr(user, "role", None)
		if role == "PARENT":
			raise PermissionDenied("No tienes permisos para modificar este caso.")
		if (
			role == "TEACHER"
			and case is not None
			and case.created_by_id != getattr(user, "id", None)
			and not self._is_group_director(user, case)
		):
			raise PermissionDenied("No tienes permisos para modificar este caso.")

	@transaction.atomic
	@action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
	def add_attachment(self, request, pk=None):
		case = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		serializer = CaseAddAttachmentSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		attachment = DisciplineCaseAttachment.objects.create(
			case=case,
			kind=serializer.validated_data.get("kind") or DisciplineCaseAttachment.Kind.EVIDENCE,
			file=serializer.validated_data["file"],
			description=serializer.validated_data.get("description", ""),
			uploaded_by=request.user,
		)
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTE,
			text=f"Adjunto agregado ({attachment.get_kind_display()}).",
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_ADD_ATTACHMENT",
			object_type="discipline_case",
			object_id=case.id,
			status_code=201,
			metadata={"attachment_id": attachment.id, "kind": attachment.kind},
		)
		return Response({"id": attachment.id}, status=status.HTTP_201_CREATED)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def add_participant(self, request, pk=None):
		case = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		serializer = CaseAddParticipantSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		participant = DisciplineCaseParticipant.objects.create(
			case=case,
			student=serializer.validated_data["student_id"],
			role=serializer.validated_data["role"],
			notes=serializer.validated_data.get("notes", ""),
		)
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTE,
			text=f"Participante agregado: {participant.student} ({participant.get_role_display()}).",
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_ADD_PARTICIPANT",
			object_type="discipline_case",
			object_id=case.id,
			status_code=201,
			metadata={"participant_id": participant.id, "role": participant.role},
		)
		return Response({"id": participant.id}, status=status.HTTP_201_CREATED)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def notify_guardian(self, request, pk=None):
		case = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		serializer = CaseNotifyGuardianSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		now = timezone.now()
		case.notified_guardian_at = case.notified_guardian_at or now
		case.save(update_fields=["notified_guardian_at", "updated_at"])

		channel = (serializer.validated_data.get("channel") or "").strip()
		note = (serializer.validated_data.get("note") or "").strip()

		# Try to locate the student's main guardian(s)
		guardians_qs = FamilyMember.objects.filter(student=case.student, is_main_guardian=True)
		if not guardians_qs.exists():
			guardians_qs = FamilyMember.objects.filter(student=case.student)

		created_logs: list[int] = []
		notified_users_count = 0
		for fm in guardians_qs:
			recipient_user = fm.user
			log = DisciplineCaseNotificationLog.objects.create(
				case=case,
				channel=channel,
				note=note,
				recipient_user=recipient_user,
				recipient_family_member=fm,
				recipient_name=fm.full_name or "",
				recipient_contact=(fm.email or fm.phone or ""),
				status=(
					DisciplineCaseNotificationLog.Status.SENT
					if recipient_user is not None
					else DisciplineCaseNotificationLog.Status.REGISTERED
				),
				created_by=request.user,
			)
			created_logs.append(log.id)
			if recipient_user is not None:
				create_notification(
					recipient=recipient_user,
					title=f"Observador: Caso disciplinario #{case.id}",
					body="Se registró una notificación asociada a un caso de convivencia.",
					url=f"/discipline/cases/{case.id}",
					type="DISCIPLINE_CASE",
					dedupe_key=f"DISCIPLINE_CASE_NOTIFY:case={case.id}:user={recipient_user.id}",
					dedupe_within_seconds=60,
				)
				notified_users_count += 1

		msg = "Notificación registrada."
		if channel:
			msg += f" Canal: {channel}."
		if note:
			msg += f" Nota: {note}"
		if created_logs:
			msg += f" Destinatarios: {len(created_logs)}."
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTIFIED_GUARDIAN,
			text=msg,
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_NOTIFY_GUARDIAN",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
			metadata={
				"logs_created": created_logs,
				"notified_users": notified_users_count,
				"channel": channel,
			},
		)
		return Response(
			{
				"detail": "OK",
				"logs_created": created_logs,
				"notified_users": notified_users_count,
			},
			status=status.HTTP_200_OK,
		)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def acknowledge_guardian(self, request, pk=None):
		case = self.get_object()
		self._ensure_not_sealed(case)
		role = getattr(getattr(request, "user", None), "role", None)
		log_id = request.data.get("log_id")
		note = (request.data.get("note") or "").strip()
		if not log_id:
			return Response({"detail": "log_id es obligatorio."}, status=status.HTTP_400_BAD_REQUEST)
		try:
			log = case.notification_logs.get(id=int(log_id))
		except Exception:
			return Response({"detail": "Notificación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		if role == "PARENT" and log.recipient_user_id != getattr(request.user, "id", None):
			raise PermissionDenied("No tienes permisos para registrar enterado de esta notificación.")

		now = timezone.now()
		log.status = DisciplineCaseNotificationLog.Status.ACKNOWLEDGED
		log.acknowledged_at = now
		log.acknowledged_by = request.user
		if note:
			log.note = (log.note + "\n\n" if log.note else "") + f"Acuse: {note}"
		log.save(update_fields=["status", "acknowledged_at", "acknowledged_by", "note"])

		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTE,
			text="Acuse/enterado registrado para una notificación a acudiente.",
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_ACK_GUARDIAN",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
			metadata={"log_id": log.id},
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def set_descargos_deadline(self, request, pk=None):
		case: DisciplineCase = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)

		serializer = CaseSetDescargosDeadlineSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		due = serializer.validated_data.get("descargos_due_at")

		case.descargos_due_at = due
		case.save(update_fields=["descargos_due_at", "updated_at"])

		text = (
			f"Fecha límite de descargos actualizada: {timezone.localtime(due).strftime('%Y-%m-%d %H:%M')}."
			if due
			else "Fecha límite de descargos eliminada."
		)
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTE,
			text=text,
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_SET_DESCARGOS_DEADLINE",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
			metadata={"descargos_due_at": due.isoformat() if due else None},
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)

	@action(
		detail=True,
		methods=["get"],
		renderer_classes=[renderers.JSONRenderer, renderers.StaticHTMLRenderer, PDFRenderer],
	)
	def acta(self, request, pk=None):
		case: DisciplineCase = self.get_object()
		want_pdf = (request.query_params.get("format") or "").lower() == "pdf"
		want_async = (request.query_params.get("async") or "").strip().lower() in {"1", "true", "yes"}
		log_event(
			request,
			event_type="DISCIPLINE_CASE_ACTA_DOWNLOAD",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
		)
		ctx = build_case_acta_context(case=case, generated_by=request.user)
		html = render_to_string("discipline/case_acta.html", ctx)

		if not want_pdf:
			response = HttpResponse(html, content_type="text/html; charset=utf-8")
			response["Content-Disposition"] = f'inline; filename="caso-{case.id}-acta.html"'
			return response
		if want_async:
			from datetime import timedelta  # noqa: PLC0415
			from reports.models import ReportJob  # noqa: PLC0415
			from reports.serializers import ReportJobSerializer  # noqa: PLC0415
			from reports.tasks import generate_report_job_pdf  # noqa: PLC0415

			ttl_hours = int(getattr(settings, "REPORT_JOBS_TTL_HOURS", 24))
			expires_at = timezone.now() + timedelta(hours=ttl_hours)

			job = ReportJob.objects.create(
				created_by=request.user,
				report_type=ReportJob.ReportType.DISCIPLINE_CASE_ACTA,
				params={"case_id": case.id},
				expires_at=expires_at,
			)
			generate_report_job_pdf.delay(job.id)
			out = ReportJobSerializer(job, context={"request": request}).data
			return Response(out, status=status.HTTP_202_ACCEPTED)

		try:
			from reports.weasyprint_utils import WeasyPrintUnavailableError, render_pdf_bytes_from_html  # noqa: PLC0415

			pdf_bytes = render_pdf_bytes_from_html(html=html, base_url=str(settings.BASE_DIR))
		except WeasyPrintUnavailableError as e:
			payload = {"detail": str(e)}
			if getattr(settings, "DEBUG", False):
				import traceback  # noqa: PLC0415

				payload["traceback"] = traceback.format_exc()
			return Response(payload, status=status.HTTP_503_SERVICE_UNAVAILABLE)

		response = HttpResponse(pdf_bytes, content_type="application/pdf")
		response["Content-Disposition"] = f'inline; filename="caso-{case.id}-acta.pdf"'
		response["Deprecation"] = "true"
		sunset = getattr(settings, "REPORTS_SYNC_SUNSET_DATE", "2026-06-30")
		response["Sunset"] = str(sunset)
		response["Link"] = '</api/reports/jobs/>; rel="alternate"'
		return response

	@transaction.atomic
	@action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
	def record_descargos(self, request, pk=None):
		case = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		serializer = CaseRecordDescargosSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		text = serializer.validated_data["text"].strip()
		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.DESCARGOS,
			text=text,
			created_by=request.user,
		)

		# Optional file in same request
		if "file" in request.FILES:
			DisciplineCaseAttachment.objects.create(
				case=case,
				kind=DisciplineCaseAttachment.Kind.DESCARGOS,
				file=request.FILES["file"],
				description="",
				uploaded_by=request.user,
			)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_RECORD_DESCARGOS",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def decide(self, request, pk=None):
		case: DisciplineCase = self.get_object()
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		serializer = CaseDecideSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		if case.status != DisciplineCase.Status.OPEN:
			return Response(
				{"detail": "El caso no está en estado ABIERTO."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		# MVP: descargos obligatorios antes de decidir
		has_descargos = case.events.filter(event_type=DisciplineCaseEvent.Type.DESCARGOS).exists()
		if not has_descargos:
			return Response(
				{"detail": "No se puede decidir sin registrar descargos."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		now = timezone.now()
		case.decision_text = serializer.validated_data["decision_text"].strip()
		case.decided_at = now
		case.decided_by = request.user
		case.status = DisciplineCase.Status.DECIDED
		case.save(update_fields=["decision_text", "decided_at", "decided_by", "status", "updated_at"])

		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.DECISION,
			text=case.decision_text,
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_DECIDE",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)

	@transaction.atomic
	@action(detail=True, methods=["post"])
	def close(self, request, pk=None):
		case: DisciplineCase = self.get_object()
		role = getattr(getattr(request, "user", None), "role", None)
		if role not in {"ADMIN", "SUPERADMIN"}:
			raise PermissionDenied("Solo administradores pueden cerrar un caso.")
		self._ensure_can_mutate(request, case)
		self._ensure_not_sealed(case)
		if case.status not in {DisciplineCase.Status.DECIDED, DisciplineCase.Status.OPEN}:
			return Response(
				{"detail": "El caso no se puede cerrar en el estado actual."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		now = timezone.now()
		case.closed_at = now
		case.closed_by = request.user
		case.status = DisciplineCase.Status.CLOSED
		case.sealed_at = now
		case.sealed_by = request.user
		case.save(
			update_fields=["closed_at", "closed_by", "status", "sealed_at", "sealed_by", "updated_at"]
		)
		case.sealed_hash = compute_case_seal_hash(case)
		case.save(update_fields=["sealed_hash", "updated_at"])

		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.CLOSED,
			text="Caso cerrado.",
			created_by=request.user,
		)
		log_event(
			request,
			event_type="DISCIPLINE_CASE_CLOSE",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)

	@transaction.atomic
	@action(detail=True, methods=["post"], url_path="add-note")
	def add_note(self, request, pk=None):
		case: DisciplineCase = self.get_object()
		self._ensure_can_mutate(request, case)
		serializer = CaseAddNoteSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		DisciplineCaseEvent.objects.create(
			case=case,
			event_type=DisciplineCaseEvent.Type.NOTE,
			text=serializer.validated_data["text"],
			created_by=request.user,
		)

		log_event(
			request,
			event_type="DISCIPLINE_CASE_NOTE_ADD",
			object_type="discipline_case",
			object_id=case.id,
			status_code=200,
			metadata={"sealed": case.sealed_at is not None},
		)
		return Response({"detail": "OK"}, status=status.HTTP_200_OK)
