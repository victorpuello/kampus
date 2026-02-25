from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings

from communications.models import EmailDelivery

from .models import Notification
from .services import create_notification, notify_users


User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_FRONTEND_BASE_URL="http://localhost:5173",
)
class NotificationEmailChannelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_user",
            email="notif@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
            first_name="Ana",
            last_name="Lopez",
        )

    def test_create_notification_sends_email_and_persists_notification(self):
        notification = create_notification(
            recipient=self.user,
            title="Nueva notificación",
            body="Tienes una actualización importante.",
            url="/notifications",
            type="system",
            dedupe_key="notif:test:1",
        )

        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(notification.title, "Nueva notificación")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Ver detalle: http://localhost:5173/notifications", mail.outbox[0].body)
        self.assertEqual(EmailDelivery.objects.count(), 1)
        self.assertEqual(EmailDelivery.objects.first().status, EmailDelivery.STATUS_SENT)

    def test_notify_users_respects_dedupe_window_for_notification_and_email(self):
        created_first = notify_users(
            recipients=[self.user],
            title="Recordatorio",
            body="Primera notificación",
            dedupe_key="notif:window:1",
            dedupe_within_seconds=3600,
        )
        created_second = notify_users(
            recipients=[self.user],
            title="Recordatorio",
            body="Segunda notificación",
            dedupe_key="notif:window:1",
            dedupe_within_seconds=3600,
        )

        self.assertEqual(created_first, 1)
        self.assertEqual(created_second, 0)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(EmailDelivery.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)
