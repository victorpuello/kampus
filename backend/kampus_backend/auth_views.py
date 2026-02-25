from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone as datetime_timezone
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.middleware.csrf import get_token
from django.db import transaction
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from django.utils import timezone
from rest_framework import status
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from communications.email_service import send_email
from users.models import PasswordResetToken
from .throttles import (
    AuthLoginIPRateThrottle,
    AuthLoginUserRateThrottle,
    AuthPasswordResetConfirmIPRateThrottle,
    AuthPasswordResetRequestEmailRateThrottle,
    AuthPasswordResetRequestIPRateThrottle,
    AuthRefreshIPRateThrottle,
)


User = get_user_model()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=20, max_length=512)
    new_password = serializers.CharField(min_length=8, max_length=128)

    def validate_new_password(self, value: str):
        validate_password(value)
        return value


def _is_secure_request(request) -> bool:
    if getattr(settings, "AUTH_COOKIE_SECURE", False):
        return True
    return bool(request.is_secure())


def _to_utc_expiration(token) -> datetime:
    exp_ts = int(token["exp"])
    return datetime.fromtimestamp(exp_ts, tz=datetime_timezone.utc)


def _set_auth_cookies(response: Response, *, access: str, refresh: str | None = None) -> None:
    access_token = AccessToken(access)
    access_exp = _to_utc_expiration(access_token)

    cookie_kwargs = {
        "httponly": True,
        "secure": getattr(settings, "AUTH_COOKIE_SECURE", False),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax"),
        "path": getattr(settings, "AUTH_COOKIE_PATH", "/"),
        "domain": getattr(settings, "AUTH_COOKIE_DOMAIN", None),
    }

    response.set_cookie(
        getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "kampus_access"),
        access,
        expires=access_exp,
        **cookie_kwargs,
    )

    if refresh:
        refresh_token = RefreshToken(refresh)
        refresh_exp = _to_utc_expiration(refresh_token)
        response.set_cookie(
            getattr(settings, "AUTH_COOKIE_REFRESH_NAME", "kampus_refresh"),
            refresh,
            expires=refresh_exp,
            **cookie_kwargs,
        )


def _clear_auth_cookies(response: Response) -> None:
    cookie_kwargs = {
        "path": getattr(settings, "AUTH_COOKIE_PATH", "/"),
        "domain": getattr(settings, "AUTH_COOKIE_DOMAIN", None),
        "samesite": getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax"),
    }

    response.delete_cookie(getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "kampus_access"), **cookie_kwargs)
    response.delete_cookie(getattr(settings, "AUTH_COOKIE_REFRESH_NAME", "kampus_refresh"), **cookie_kwargs)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        token = get_token(request)
        return Response({"detail": "CSRF cookie set.", "csrfToken": token}, status=status.HTTP_200_OK)


class CookieLoginAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthLoginIPRateThrottle, AuthLoginUserRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = TokenObtainPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        access = serializer.validated_data["access"]
        refresh = serializer.validated_data["refresh"]
        response = Response({"detail": "Login exitoso."}, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access=access, refresh=refresh)
        get_token(request)
        return response


class CookieRefreshAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRefreshIPRateThrottle]

    def post(self, request, *args, **kwargs):
        refresh_cookie_name = getattr(settings, "AUTH_COOKIE_REFRESH_NAME", "kampus_refresh")
        refresh = request.COOKIES.get(refresh_cookie_name) or request.data.get("refresh")
        if not refresh:
            return Response({"detail": "Refresh token requerido."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={"refresh": refresh})
        serializer.is_valid(raise_exception=True)

        access = serializer.validated_data["access"]
        next_refresh = serializer.validated_data.get("refresh")
        response = Response({"detail": "Token refrescado."}, status=status.HTTP_200_OK)
        _set_auth_cookies(response, access=access, refresh=next_refresh)
        return response


class CookieLogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        response = Response({"detail": "Sesión cerrada."}, status=status.HTTP_200_OK)
        _clear_auth_cookies(response)
        return response


class PasswordResetRequestAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [
        AuthPasswordResetRequestIPRateThrottle,
        AuthPasswordResetRequestEmailRateThrottle,
    ]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user is not None:
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            expires_at = timezone.now() + timedelta(seconds=max(60, int(getattr(settings, "PASSWORD_RESET_TOKEN_TTL_SECONDS", 3600))))
            requested_ip = request.META.get("REMOTE_ADDR")

            with transaction.atomic():
                PasswordResetToken.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
                PasswordResetToken.objects.create(
                    user=user,
                    token_hash=token_hash,
                    expires_at=expires_at,
                    requested_ip=requested_ip,
                )

            reset_url = f"{settings.KAMPUS_FRONTEND_BASE_URL}/reset-password?token={token}"
            body = (
                "Hola,\n\n"
                "Recibimos una solicitud para restablecer tu contraseña en Kampus.\n"
                f"Usa este enlace para continuar: {reset_url}\n\n"
                "Si no solicitaste este cambio, ignora este mensaje.\n"
                "Este enlace vence en 1 hora."
            )
            send_email(
                recipient_email=user.email,
                subject="Restablecer contraseña - Kampus",
                body_text=body,
                category="password-reset",
                idempotency_key=f"password-reset:{user.id}:{token_hash[:16]}",
            )
        else:
            # Dummy operation to reduce user-enumeration timing differences.
            hashlib.sha256((email + secrets.token_hex(16)).encode("utf-8")).hexdigest()

        return Response(
            {"detail": "Si el correo existe en el sistema, recibirás un enlace para restablecer la contraseña."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthPasswordResetConfirmIPRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = timezone.now()

        reset_record = PasswordResetToken.objects.filter(
            token_hash=token_hash,
            used_at__isnull=True,
            expires_at__gt=now,
        ).select_related("user").first()

        if reset_record is None:
            return Response(
                {"detail": "Token inválido o expirado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = reset_record.user
        user.set_password(new_password)
        user.must_change_password = False

        with transaction.atomic():
            user.save(update_fields=["password", "must_change_password"])
            reset_record.mark_used()
            PasswordResetToken.objects.filter(user=user, used_at__isnull=True).exclude(id=reset_record.id).update(used_at=now)

        return Response({"detail": "Tu contraseña fue actualizada exitosamente."}, status=status.HTTP_200_OK)
