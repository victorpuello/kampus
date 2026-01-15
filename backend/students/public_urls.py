from django.urls import path

from .views import PublicCertificateVerifyView


urlpatterns = [
    path(
        "certificates/<uuid:uuid>/verify/",
        PublicCertificateVerifyView.as_view(),
        name="public-certificate-verify",
    ),
]
