from __future__ import annotations

from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
	actor_username = serializers.CharField(source="actor.username", read_only=True)
	actor_role = serializers.CharField(source="actor.role", read_only=True)

	class Meta:
		model = AuditLog
		fields = [
			"id",
			"created_at",
			"actor",
			"actor_username",
			"actor_role",
			"event_type",
			"object_type",
			"object_id",
			"path",
			"method",
			"status_code",
			"ip_address",
			"user_agent",
			"metadata",
		]
		read_only_fields = fields
