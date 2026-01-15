from django.urls import path

from .views import PublicCertificateVerifyView, PublicCertificateVerifyUIView


urlpatterns = [
    path(
        "certificates/<uuid:uuid>/",
        PublicCertificateVerifyUIView.as_view(),
        name="public-site-certificate-verify-ui",
    ),
    path(
        "certificates/<uuid:uuid>/verify/",
        PublicCertificateVerifyView.as_view(),
        name="public-site-certificate-verify",
    ),
]
