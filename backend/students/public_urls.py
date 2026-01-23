from django.urls import path, re_path

from .views import (
    PublicCertificateVerifyLegacyView,
    PublicCertificateVerifyLegacyUIView,
    PublicCertificateVerifyView,
    PublicCertificateVerifyUIView,
)


urlpatterns = [
    # Some legacy QR generators ended up with leading whitespace in the path segment
    # after /api/public/ (e.g. /api/public/  certificates/<id>/). Accept and redirect.
    re_path(
        r"^\s+certificates/(?P<uuid_str>[^/]+)/?$",
        PublicCertificateVerifyLegacyUIView.as_view(),
        name="public-certificate-verify-ui-spacey",
    ),
    re_path(
        r"^\s+certificates/(?P<uuid_str>[^/]+)/verify/?$",
        PublicCertificateVerifyLegacyView.as_view(),
        name="public-certificate-verify-spacey",
    ),
    path(
        "certificates/<uuid:uuid>/",
        PublicCertificateVerifyUIView.as_view(),
        name="public-certificate-verify-ui",
    ),
    path(
        "certificates/<str:uuid_str>/",
        PublicCertificateVerifyLegacyUIView.as_view(),
        name="public-certificate-verify-ui-legacy",
    ),
    path(
        "certificates/<uuid:uuid>/verify/",
        PublicCertificateVerifyView.as_view(),
        name="public-certificate-verify",
    ),
    path(
        "certificates/<str:uuid_str>/verify/",
        PublicCertificateVerifyLegacyView.as_view(),
        name="public-certificate-verify-legacy",
    ),
]
