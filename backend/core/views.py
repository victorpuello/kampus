import json
from datetime import datetime

from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse

from .models import Institution, Campus
from .serializers import InstitutionSerializer, CampusSerializer
from .permissions import KampusModelPermissions, IsAdminOrReadOnly
from users.permissions import IsAdmin
from core.utils.config_transfer import export_config, import_config

class InstitutionViewSet(viewsets.ModelViewSet):
    queryset = Institution.objects.all()
    serializer_class = InstitutionSerializer
    permission_classes = [KampusModelPermissions]

class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [KampusModelPermissions]


def _parse_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
    return default


class ConfigExportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        include_media = _parse_bool(request.query_params.get("include_media"), default=False)
        payload = export_config(include_media=include_media)

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"kampus_config_{ts}.json"

        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        resp = HttpResponse(body, content_type="application/json; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp


class ConfigImportView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        overwrite = _parse_bool(request.data.get("overwrite"), default=False)
        confirm_overwrite = _parse_bool(request.data.get("confirm_overwrite"), default=False)
        dry_run = _parse_bool(request.data.get("dry_run"), default=False)

        if overwrite and not confirm_overwrite:
            return Response(
                {"detail": "Para usar overwrite debes confirmar con confirm_overwrite=true."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = None
        file_obj = request.FILES.get("file")
        if file_obj is not None:
            try:
                payload = json.loads(file_obj.read().decode("utf-8"))
            except Exception:
                return Response(
                    {"detail": "Archivo inválido: debe ser JSON UTF-8."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Allow raw JSON body
            if isinstance(request.data, dict) and "schema_version" in request.data:
                payload = request.data

        if payload is None:
            return Response(
                {"detail": "Debes enviar un archivo en 'file' o un JSON válido en el body."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = import_config(payload, overwrite=overwrite, dry_run=dry_run)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "dry_run": dry_run,
                "overwrite": overwrite,
                "created": result.created,
                "skipped": result.skipped,
            },
            status=status.HTTP_200_OK,
        )
