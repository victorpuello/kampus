"""
URL configuration for kampus_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .auth_views import CookieLoginAPIView, CookieLogoutAPIView, CookieRefreshAPIView, CsrfCookieAPIView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/csrf/", CsrfCookieAPIView.as_view(), name="auth_csrf"),
    path("api/auth/login/", CookieLoginAPIView.as_view(), name="auth_cookie_login"),
    path("api/auth/refresh/", CookieRefreshAPIView.as_view(), name="auth_cookie_refresh"),
    path("api/auth/logout/", CookieLogoutAPIView.as_view(), name="auth_cookie_logout"),
    path("api/", include("users.urls")),
    path("api/", include("students.urls")),
    path("api/teachers/", include("teachers.urls")),
    path("api/", include("academic.urls")),
    path("api/", include("attendance.urls")),
    path("api/", include("elections.urls")),
    path("api/", include("core.urls")),
    path("api/", include("notifications.urls")),
    path("api/", include("discipline.urls")),
    path("api/", include("audit.urls")),
    path("api/", include("reports.urls")),
    # NOTE: /api/novelties/ ya existe en students (legacy). Esta app nueva se monta
    # en un namespace separado para permitir migración gradual.
    path("api/novelties-workflow/", include("novelties.urls")),
    path("api/public/", include("verification.public_urls")),
    path("api/public/", include("students.public_urls")),
    path("public/", include("verification.public_site_urls")),
    path("public/", include("students.public_site_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

