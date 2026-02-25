from django.urls import path

from .views import (
    CommunicationPreferenceMeView,
    MailgunWebhookView,
    MarketingOneClickUnsubscribeView,
)


urlpatterns = [
    path("webhooks/mailgun/", MailgunWebhookView.as_view(), name="communications_mailgun_webhook"),
    path("preferences/me/", CommunicationPreferenceMeView.as_view(), name="communications_preference_me"),
    path("unsubscribe/one-click/", MarketingOneClickUnsubscribeView.as_view(), name="communications_unsubscribe_one_click"),
]
