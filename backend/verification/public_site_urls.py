from django.urls import path

from .views_public import PublicVerifyAPIView


urlpatterns = [
    path("verify/<str:token>/", PublicVerifyAPIView.as_view(), name="public-site-verify-ui"),
]
