from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return Notification.objects.none()
        return Notification.objects.filter(recipient=user)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        return Response({"unread": qs.count()}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        obj: Notification = self.get_object()
        if obj.read_at is None:
            obj.read_at = timezone.now()
            obj.save(update_fields=["read_at"])
        return Response({"detail": "ok"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        qs = self.get_queryset().filter(read_at__isnull=True)
        now = timezone.now()
        updated = qs.update(read_at=now)
        return Response({"updated": updated}, status=status.HTTP_200_OK)
