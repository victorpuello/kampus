from __future__ import annotations

from typing import Any, Optional

from django.http import HttpRequest

from .models import AuditLog


def _get_ip(request: HttpRequest) -> str:
	xff = (request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
	if xff:
		# XFF can contain multiple IPs: client, proxy1, proxy2...
		return xff.split(",")[0].strip()
	return (request.META.get("REMOTE_ADDR") or "").strip()


def log_event(
	request: HttpRequest,
	*,
	event_type: str,
	object_type: str = "",
	object_id: str | int = "",
	status_code: Optional[int] = None,
	metadata: Optional[dict[str, Any]] = None,
) -> Optional[AuditLog]:
	user = getattr(request, "user", None)
	if not getattr(user, "is_authenticated", False):
		return None

	obj_id_str = str(object_id) if object_id is not None else ""
	return AuditLog.objects.create(
		actor=user,
		event_type=event_type,
		object_type=object_type or "",
		object_id=obj_id_str,
		path=(getattr(request, "path", "") or ""),
		method=(getattr(request, "method", "") or ""),
		status_code=status_code,
		ip_address=_get_ip(request),
		user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:4000],
		metadata=metadata or {},
	)
