from django.urls import path

from .views import (
    MailSettingsAuditCsvExportView,
    CommunicationPreferenceMeView,
    MailSettingsAuditListView,
    MailSettingsTestView,
    MailSettingsView,
    MailgunWebhookView,
    MarketingOneClickUnsubscribeView,
)


urlpatterns = [
    path("webhooks/mailgun/", MailgunWebhookView.as_view(), name="communications_mailgun_webhook"),
    path("preferences/me/", CommunicationPreferenceMeView.as_view(), name="communications_preference_me"),
    path("unsubscribe/one-click/", MarketingOneClickUnsubscribeView.as_view(), name="communications_unsubscribe_one_click"),
    path("settings/mailgun/", MailSettingsView.as_view(), name="communications_mailgun_settings"),
    path("settings/mailgun/test/", MailSettingsTestView.as_view(), name="communications_mailgun_settings_test"),
    path("settings/mailgun/audits/", MailSettingsAuditListView.as_view(), name="communications_mailgun_settings_audits"),
    path("settings/mailgun/audits/export/", MailSettingsAuditCsvExportView.as_view(), name="communications_mailgun_settings_audits_export"),
]
