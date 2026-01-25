from __future__ import annotations

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class PublicVerifyRateThrottle(SimpleRateThrottle):
    scope = "public_verify"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "PUBLIC_VERIFY_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()
