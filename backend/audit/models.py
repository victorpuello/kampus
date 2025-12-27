from __future__ import annotations

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
	"""Minimal audit trail for sensitive operations and reads.

	Note: keep payload small; store details in `metadata`.
	"""

	actor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="audit_logs",
	)

	event_type = models.CharField(max_length=80)
	object_type = models.CharField(max_length=80, blank=True, default="")
	object_id = models.CharField(max_length=80, blank=True, default="")

	path = models.CharField(max_length=300, blank=True, default="")
	method = models.CharField(max_length=10, blank=True, default="")
	status_code = models.PositiveSmallIntegerField(null=True, blank=True)

	ip_address = models.CharField(max_length=64, blank=True, default="")
	user_agent = models.TextField(blank=True, default="")

	metadata = models.JSONField(default=dict, blank=True)

	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at", "-id"]
		indexes = [
			models.Index(fields=["created_at"]),
			models.Index(fields=["event_type", "created_at"]),
			models.Index(fields=["object_type", "object_id", "created_at"]),
			models.Index(fields=["actor", "created_at"]),
		]

	def __str__(self) -> str:
		obj = f"{self.object_type}:{self.object_id}" if self.object_type or self.object_id else "-"
		return f"{self.created_at:%Y-%m-%d %H:%M:%S} {self.event_type} {obj}"
