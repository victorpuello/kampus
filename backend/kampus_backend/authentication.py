from __future__ import annotations

from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication
from users.security import is_password_change_exempt_path


class KampusJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header_auth = super().authenticate(request)
        if header_auth is not None:
            self._enforce_password_change(header_auth[0], request)
            return header_auth

        raw_token = request.COOKIES.get(getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "kampus_access"))
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        self._enforce_csrf(request)
        user = self.get_user(validated_token)
        self._enforce_password_change(user, request)
        return user, validated_token

    def _enforce_password_change(self, user, request) -> None:
        if not user or not getattr(user, "is_authenticated", False):
            return
        if not getattr(user, "must_change_password", False):
            return
        if is_password_change_exempt_path(getattr(request, "path", "")):
            return
        raise exceptions.PermissionDenied("Debes actualizar tu contraseña temporal antes de continuar.")

    def _enforce_csrf(self, request) -> None:
        check = CSRFCheck(lambda req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")
