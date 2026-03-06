from django.urls import path

from .views_public import (
    PublicDataDeletionInstructionsView,
    PublicPrivacyPolicyView,
    PublicTermsOfServiceView,
    PublicVerifyAPIView,
)


urlpatterns = [
    path("verify/<str:token>/", PublicVerifyAPIView.as_view(), name="public-site-verify-ui"),
    path("legal/privacy-policy/", PublicPrivacyPolicyView.as_view(), name="public-site-privacy-policy"),
    path("legal/terms-of-service/", PublicTermsOfServiceView.as_view(), name="public-site-terms-of-service"),
    path(
        "legal/data-deletion/",
        PublicDataDeletionInstructionsView.as_view(),
        name="public-site-data-deletion",
    ),
]
