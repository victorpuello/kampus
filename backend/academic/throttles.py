from __future__ import annotations

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class AcademicAIUserRateThrottle(SimpleRateThrottle):
    """Throttle por usuario autenticado para endpoints de IA académica."""

    scope = "academic_ai_user"

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            ident = f"user:{user.pk}"
        else:
            ident = self.get_ident(request)

        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "ACADEMIC_AI_USER_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()
