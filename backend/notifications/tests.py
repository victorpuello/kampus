import json
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

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
        delivery = EmailDelivery.objects.first()
        self.assertEqual(delivery.status, EmailDelivery.STATUS_SENT)
        self.assertEqual(delivery.category, "in-app-notification")
        self.assertIn("ESTE CORREO ES ÚNICAMENTE INFORMATIVO", delivery.body_text)
        self.assertIn("Si el botón no funciona, usa este enlace de respaldo", delivery.body_html)

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

    def test_novelty_sla_notification_uses_specialized_template(self):
        create_notification(
            recipient=self.user,
            title="Escalamiento SLA: 4 novedades en revisión",
            body="Hay 4 casos en IN_REVIEW sin cambios desde hace 3+ días.",
            url="/novelties",
            type="NOVELTY_SLA_ADMIN",
            dedupe_key="notif:novelty:sla:admin",
        )

        delivery = EmailDelivery.objects.first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.category, "in-app-notification")
        self.assertIn("Escalamiento SLA", delivery.subject)
        self.assertIn("Ver tablero de novedades", delivery.body_text)

    def test_notification_without_url_uses_default_notifications_route(self):
        create_notification(
            recipient=self.user,
            title="Recordatorio sin URL",
            body="Tienes una actualización pendiente.",
            type="system",
            dedupe_key="notif:no-url:1",
        )

        delivery = EmailDelivery.objects.first()
        self.assertIsNotNone(delivery)
        self.assertIn("http://localhost:5173/notifications", delivery.body_text)
        self.assertIn("Si el botón no funciona, usa este enlace de respaldo", delivery.body_html)


class NotificationObservabilityCommandsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="observer_user",
            email="observer@example.com",
            password="pass1234",
            role=User.ROLE_ADMIN,
        )

    def test_report_notifications_kpis_json_output(self):
        Notification.objects.create(
            recipient=self.user,
            title="A",
            body="Uno",
            type="system",
            dedupe_key="obs:notif:1",
        )
        read_notification = Notification.objects.create(
            recipient=self.user,
            title="B",
            body="Dos",
            type="system",
            dedupe_key="obs:notif:2",
        )
        read_notification.read_at = timezone.now()
        read_notification.save(update_fields=["read_at"])

        sent_delivery = EmailDelivery.objects.create(
            recipient_email="ok@example.com",
            subject="OK",
            body_text="ok",
            status=EmailDelivery.STATUS_SENT,
            category="in-app-notification",
            created_at=timezone.now() - timedelta(minutes=3),
            sent_at=timezone.now() - timedelta(minutes=2),
        )
        sent_delivery.save(update_fields=["sent_at"])

        EmailDelivery.objects.create(
            recipient_email="failed@example.com",
            subject="FAIL",
            body_text="fail",
            status=EmailDelivery.STATUS_FAILED,
            category="in-app-notification",
        )
        EmailDelivery.objects.create(
            recipient_email="suppressed@example.com",
            subject="SUP",
            body_text="sup",
            status=EmailDelivery.STATUS_SUPPRESSED,
            category="in-app-notification",
        )

        output = StringIO()
        call_command("report_notifications_kpis", "--hours", "24", "--format", "json", stdout=output)
        payload = json.loads(output.getvalue().strip())

        self.assertEqual(payload["in_app"]["total"], 2)
        self.assertEqual(payload["in_app"]["unread"], 1)
        self.assertEqual(payload["email"]["failed"], 1)
        self.assertEqual(payload["email"]["suppressed"], 1)
        self.assertEqual(payload["email"]["sent"], 1)
        self.assertIsNotNone(payload["email"]["avg_send_latency_seconds"])

    def test_check_notifications_health_raises_on_breach(self):
        EmailDelivery.objects.create(
            recipient_email="failed1@example.com",
            subject="FAIL1",
            body_text="fail",
            status=EmailDelivery.STATUS_FAILED,
            category="in-app-notification",
        )
        EmailDelivery.objects.create(
            recipient_email="failed2@example.com",
            subject="FAIL2",
            body_text="fail",
            status=EmailDelivery.STATUS_FAILED,
            category="in-app-notification",
        )

        with self.assertRaises(CommandError):
            call_command(
                "check_notifications_health",
                "--hours",
                "24",
                "--max-failed",
                "1",
            )

    def test_check_notifications_health_no_fail_flag(self):
        EmailDelivery.objects.create(
            recipient_email="failed3@example.com",
            subject="FAIL3",
            body_text="fail",
            status=EmailDelivery.STATUS_FAILED,
            category="in-app-notification",
        )

        output = StringIO()
        call_command(
            "check_notifications_health",
            "--hours",
            "24",
            "--max-failed",
            "0",
            "--no-fail-on-breach",
            stdout=output,
        )
        self.assertIn("ALERT", output.getvalue())
