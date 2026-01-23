from pathlib import Path

from django.utils import timezone
from datetime import timedelta

from django.conf import settings
from django.http import HttpResponse
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from users.models import User

from .models import ReportJob
from .serializers import ReportJobCreateSerializer, ReportJobSerializer
from .tasks import _render_report_html, generate_report_job_pdf


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

		job = ReportJob.objects.create(
			created_by=user,
			report_type=serializer.validated_data["report_type"],
			params=serializer.validated_data.get("params") or {},
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
