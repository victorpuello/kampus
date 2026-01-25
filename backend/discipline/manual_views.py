from __future__ import annotations

import datetime

from django.core.files.base import ContentFile
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import log_event
from core.models import Institution
from users.permissions import IsAdmin

from .manual_processing import process_manual
from .models import ManualConvivencia
from .serializers import ManualConvivenciaSerializer, ManualConvivenciaUploadSerializer


class ManualConvivenciaViewSet(viewsets.ModelViewSet):
    queryset = (
        ManualConvivencia.objects.select_related("institution", "uploaded_by")
        .all()
        .order_by("-uploaded_at", "-id")
    )
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action in {"create", "activate", "process"}:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return ManualConvivenciaUploadSerializer
        return ManualConvivenciaSerializer

    def create(self, request, *args, **kwargs):
        serializer = ManualConvivenciaUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        inst = Institution.objects.first()
        if not inst:
            return Response({"detail": "No hay institución configurada."}, status=status.HTTP_400_BAD_REQUEST)

        title = (serializer.validated_data.get("title") or "Manual de Convivencia").strip() or "Manual de Convivencia"
        version = (serializer.validated_data.get("version") or "").strip()
        activate = bool(serializer.validated_data.get("activate", True))

        uploaded_file = serializer.validated_data.get("file")
        text = (serializer.validated_data.get("text") or "").strip()
        if not uploaded_file and text:
            safe_version = version or datetime.date.today().isoformat()
            filename = f"manual_convivencia_{safe_version}.md"
            uploaded_file = ContentFile(text.encode("utf-8"), name=filename)

        manual = ManualConvivencia.objects.create(
            institution=inst,
            title=title,
            version=version,
            file=uploaded_file,
            uploaded_by=request.user,
            is_active=False,
        )

        if activate:
            ManualConvivencia.objects.filter(institution=inst, is_active=True).exclude(id=manual.id).update(is_active=False)
            manual.is_active = True
            manual.save(update_fields=["is_active"])

        process_manual(manual)
        log_event(
            request,
            event_type="DISCIPLINE_MANUAL_UPLOAD",
            object_type="convivencia_manual",
            object_id=manual.id,
            status_code=201,
            metadata={"activate": activate, "extraction_status": manual.extraction_status},
        )

        return Response(ManualConvivenciaSerializer(manual).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        inst = Institution.objects.first()
        if not inst:
            return Response({"detail": "No hay institución configurada."}, status=status.HTTP_400_BAD_REQUEST)
        manual = ManualConvivencia.objects.filter(institution=inst, is_active=True).order_by("-id").first()
        return Response(ManualConvivenciaSerializer(manual).data if manual else None, status=status.HTTP_200_OK)

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        manual: ManualConvivencia = self.get_object()
        ManualConvivencia.objects.filter(institution=manual.institution, is_active=True).exclude(id=manual.id).update(is_active=False)
        manual.is_active = True
        manual.save(update_fields=["is_active"])
        log_event(
            request,
            event_type="DISCIPLINE_MANUAL_ACTIVATE",
            object_type="convivencia_manual",
            object_id=manual.id,
            status_code=200,
        )
        return Response({"detail": "OK"}, status=status.HTTP_200_OK)

    @transaction.atomic
    @action(detail=True, methods=["post"], url_path="process")
    def process(self, request, pk=None):
        manual: ManualConvivencia = self.get_object()
        process_manual(manual)
        log_event(
            request,
            event_type="DISCIPLINE_MANUAL_PROCESS",
            object_type="convivencia_manual",
            object_id=manual.id,
            status_code=200,
            metadata={"extraction_status": manual.extraction_status},
        )
        return Response(ManualConvivenciaSerializer(manual).data, status=status.HTTP_200_OK)
