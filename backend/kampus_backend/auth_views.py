from __future__ import annotations

from datetime import datetime, timezone as datetime_timezone

from django.conf import settings
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken


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
