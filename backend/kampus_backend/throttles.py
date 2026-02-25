from __future__ import annotations

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class AuthLoginIPRateThrottle(SimpleRateThrottle):
    scope = "auth_login_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_LOGIN_IP_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()


class AuthLoginUserRateThrottle(SimpleRateThrottle):
    scope = "auth_login_user"

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "") or "").strip().lower()
        if not username:
            return None
        return self.cache_format % {"scope": self.scope, "ident": username}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_LOGIN_USER_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()


class AuthRefreshIPRateThrottle(SimpleRateThrottle):
    scope = "auth_refresh_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_REFRESH_IP_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()


class AuthPasswordResetRequestIPRateThrottle(SimpleRateThrottle):
    scope = "auth_password_reset_request_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_PASSWORD_RESET_REQUEST_IP_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()


class AuthPasswordResetRequestEmailRateThrottle(SimpleRateThrottle):
    scope = "auth_password_reset_request_email"

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "") or "").strip().lower()
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_PASSWORD_RESET_REQUEST_EMAIL_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()


class AuthPasswordResetConfirmIPRateThrottle(SimpleRateThrottle):
    scope = "auth_password_reset_confirm_ip"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}

    def get_rate(self):
        explicit = str(getattr(settings, "AUTH_PASSWORD_RESET_CONFIRM_IP_THROTTLE_RATE", "") or "").strip()
        if explicit:
            return explicit
        return super().get_rate()
