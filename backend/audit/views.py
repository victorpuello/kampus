from __future__ import annotations

from rest_framework import permissions, viewsets

from users.permissions import IsAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
	queryset = AuditLog.objects.select_related("actor").all().order_by("-created_at", "-id")
	serializer_class = AuditLogSerializer
	permission_classes = [permissions.IsAuthenticated, IsAdmin]
	filterset_fields = ["event_type", "object_type", "object_id", "actor"]
