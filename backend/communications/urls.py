from django.urls import path

from .views import (
    EmailTemplateDetailView,
    EmailTemplateListView,
    EmailTemplatePreviewView,
    EmailTemplateSendTestView,
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
    path("settings/email-templates/", EmailTemplateListView.as_view(), name="communications_email_templates_list"),
    path("settings/email-templates/<slug:slug>/", EmailTemplateDetailView.as_view(), name="communications_email_templates_detail"),
    path("settings/email-templates/<slug:slug>/preview/", EmailTemplatePreviewView.as_view(), name="communications_email_templates_preview"),
    path("settings/email-templates/<slug:slug>/test/", EmailTemplateSendTestView.as_view(), name="communications_email_templates_test"),
]
