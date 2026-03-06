import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from communications.models import EmailDelivery

from .models import Notification, NotificationDispatch, NotificationType
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

    def test_create_notification_creates_email_dispatch_outbox_row(self):
        notification = create_notification(
            recipient=self.user,
            title="Outbox email",
            body="Prueba outbox email",
            type="system",
            dedupe_key="notif:outbox:email:1",
        )

        dispatch = NotificationDispatch.objects.filter(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(dispatch)
        self.assertEqual(dispatch.status, NotificationDispatch.STATUS_PENDING)
        self.assertTrue(bool(dispatch.idempotency_key))

    def test_create_notification_emits_structured_log_events(self):
        with self.assertLogs("notifications.services", level="INFO") as captured:
            create_notification(
                recipient=self.user,
                title="Outbox log",
                body="Prueba logging",
                type="system",
                dedupe_key="notif:outbox:log:1",
            )

        joined = "\n".join(captured.output)
        self.assertIn("notification.created", joined)
        self.assertIn("notification.email.dispatch.start", joined)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_WHATSAPP_ENABLED=True,
)
class NotificationOutboxWhatsAppTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_outbox_wa_user",
            email="notif_outbox_wa@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_create_notification_creates_whatsapp_dispatch_outbox_row_when_enabled(self):
        with patch("notifications.tasks.send_notification_whatsapp_task.delay"):
            notification = create_notification(
                recipient=self.user,
                title="Outbox WA",
                body="Prueba outbox whatsapp",
                type="NOVELTY_SLA_ADMIN",
                dedupe_key="notif:outbox:wa:1",
            )

        dispatch = NotificationDispatch.objects.filter(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_WHATSAPP,
        ).first()
        self.assertIsNotNone(dispatch)
        self.assertEqual(dispatch.status, NotificationDispatch.STATUS_PENDING)
        self.assertTrue(bool(dispatch.idempotency_key))


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_WHATSAPP_ENABLED=True,
    KAMPUS_NOTIFICATIONS_OUTBOX_ONLY=True,
)
class NotificationOutboxOnlyModeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_outbox_only_user",
            email="notif_outbox_only@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_create_notification_does_not_send_email_immediately_in_outbox_only_mode(self):
        create_notification(
            recipient=self.user,
            title="Outbox only email",
            body="No immediate email expected",
            type="system",
            dedupe_key="notif:outbox-only:email:1",
        )

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(EmailDelivery.objects.count(), 0)
        self.assertEqual(
            NotificationDispatch.objects.filter(channel=NotificationDispatch.CHANNEL_EMAIL).count(),
            1,
        )

    def test_create_notification_does_not_enqueue_whatsapp_task_in_outbox_only_mode(self):
        with patch("notifications.tasks.send_notification_whatsapp_task.delay") as mocked_delay:
            create_notification(
                recipient=self.user,
                title="Outbox only wa",
                body="No immediate task expected",
                type="NOVELTY_SLA_ADMIN",
                dedupe_key="notif:outbox-only:wa:1",
            )

        mocked_delay.assert_not_called()
        self.assertEqual(
            NotificationDispatch.objects.filter(channel=NotificationDispatch.CHANNEL_WHATSAPP).count(),
            1,
        )


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


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_WHATSAPP_ENABLED=True,
)
class NotificationDispatchProcessingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dispatch_user",
            email="dispatch@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_process_dispatches_marks_email_dispatch_succeeded_without_duplicate_delivery(self):
        notification = create_notification(
            recipient=self.user,
            title="Dispatch email",
            body="Procesar outbox email",
            type="system",
            dedupe_key="dispatch:email:1",
        )

        initial_deliveries = EmailDelivery.objects.count()
        self.assertEqual(initial_deliveries, 1)

        output = StringIO()
        call_command("process_notification_dispatches", "--batch-size", "20", stdout=output)

        email_dispatch = NotificationDispatch.objects.filter(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(email_dispatch)
        self.assertEqual(email_dispatch.status, NotificationDispatch.STATUS_SUCCEEDED)
        self.assertEqual(EmailDelivery.objects.count(), initial_deliveries)

    def test_process_dispatches_marks_whatsapp_dispatch_succeeded_when_no_contact(self):
        with patch("notifications.tasks.send_notification_whatsapp_task.delay"):
            notification = create_notification(
                recipient=self.user,
                title="Dispatch wa",
                body="Procesar outbox wa",
                type="NOVELTY_SLA_ADMIN",
                dedupe_key="dispatch:wa:1",
            )

        output = StringIO()
        call_command("process_notification_dispatches", "--batch-size", "20", stdout=output)

        wa_dispatch = NotificationDispatch.objects.filter(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_WHATSAPP,
        ).first()
        self.assertIsNotNone(wa_dispatch)
        self.assertEqual(wa_dispatch.status, NotificationDispatch.STATUS_SUCCEEDED)
        self.assertEqual((wa_dispatch.payload or {}).get("result"), "skipped_no_active_contact")


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_NOTIFICATIONS_OUTBOX_ONLY=True,
    KAMPUS_FRONTEND_BASE_URL="https://app.kampus.test",
)
class NotificationDispatchAbsoluteUrlTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dispatch_absolute_url_user",
            email="dispatch_absolute_url@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_process_dispatches_resolves_relative_action_url_to_absolute(self):
        create_notification(
            recipient=self.user,
            title="Recordatorio planeacion",
            body="Completa la planeacion pendiente",
            url="/planning",
            type="PLANNING_REMINDER_INCOMPLETE",
            dedupe_key="dispatch:absolute-url:1",
        )

        self.assertEqual(EmailDelivery.objects.count(), 0)
        call_command("process_notification_dispatches", "--batch-size", "20")

        delivery = EmailDelivery.objects.first()
        self.assertIsNotNone(delivery)
        self.assertIn("https://app.kampus.test/planning", delivery.body_html)
        self.assertNotIn('href="/planning"', delivery.body_html)


class DispatchOutboxHealthCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dispatch_health_user",
            email="dispatch_health@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_check_dispatch_outbox_health_ok_when_within_thresholds(self):
        notification = Notification.objects.create(
            recipient=self.user,
            title="Outbox healthy",
            body="OK",
            type="system",
            dedupe_key="dispatch:health:ok",
        )
        NotificationDispatch.objects.create(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
            idempotency_key="dispatch-health-ok-1",
            status=NotificationDispatch.STATUS_PENDING,
            payload={},
        )

        output = StringIO()
        call_command(
            "check_dispatch_outbox_health",
            "--max-pending",
            "10",
            "--max-failed",
            "10",
            "--max-oldest-pending-age-seconds",
            "999999",
            stdout=output,
        )
        self.assertIn("OK", output.getvalue())

    def test_check_dispatch_outbox_health_raises_on_breach(self):
        old_created_at = timezone.now() - timedelta(hours=2)
        notification = Notification.objects.create(
            recipient=self.user,
            title="Outbox breach",
            body="ALERT",
            type="system",
            dedupe_key="dispatch:health:breach",
        )
        dispatch = NotificationDispatch.objects.create(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
            idempotency_key="dispatch-health-breach-1",
            status=NotificationDispatch.STATUS_PENDING,
            payload={},
        )
        NotificationDispatch.objects.filter(id=dispatch.id).update(created_at=old_created_at)

        with self.assertRaises(CommandError):
            call_command(
                "check_dispatch_outbox_health",
                "--max-pending",
                "0",
                "--max-oldest-pending-age-seconds",
                "60",
                "--fail-on-breach",
            )


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
    KAMPUS_WHATSAPP_ENABLED=True,
)
class NotificationTypeCatalogTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_type_user",
            email="notif_type@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_create_notification_upserts_notification_type_catalog(self):
        create_notification(
            recipient=self.user,
            title="Catalog",
            body="Catalog",
            type="NOVELTY_SLA_ADMIN",
            dedupe_key="notif:type:catalog:1",
        )
        self.assertTrue(NotificationType.objects.filter(code="NOVELTY_SLA_ADMIN").exists())

    def test_notification_type_can_disable_email_dispatch_creation(self):
        NotificationType.objects.create(code="TYPE_NO_EMAIL", email_enabled=False, whatsapp_enabled=True)
        notification = create_notification(
            recipient=self.user,
            title="No email",
            body="No email",
            type="TYPE_NO_EMAIL",
            dedupe_key="notif:type:no-email:1",
        )
        self.assertFalse(
            NotificationDispatch.objects.filter(
                notification=notification,
                channel=NotificationDispatch.CHANNEL_EMAIL,
            ).exists()
        )


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=True,
)
class NotificationDispatchDlqTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dispatch_dlq_user",
            email="dispatch_dlq@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
        )

    def test_failed_dispatch_moves_to_dead_letter_after_max_retries(self):
        notification = Notification.objects.create(
            recipient=self.user,
            title="DLQ",
            body="DLQ",
            type="system",
            dedupe_key="dispatch:dlq:1",
        )
        dispatch = NotificationDispatch.objects.create(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
            idempotency_key="dispatch-dlq-1",
            status=NotificationDispatch.STATUS_PENDING,
            payload={},
        )

        with patch("notifications.dispatch._process_email_dispatch", side_effect=Exception("boom")):
            call_command("process_notification_dispatches", "--batch-size", "20", "--max-retries", "1")

        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, NotificationDispatch.STATUS_DEAD_LETTER)

    def test_retry_notification_dispatches_requeues_dead_letter(self):
        notification = Notification.objects.create(
            recipient=self.user,
            title="Retry",
            body="Retry",
            type="system",
            dedupe_key="dispatch:retry:1",
        )
        dispatch = NotificationDispatch.objects.create(
            notification=notification,
            channel=NotificationDispatch.CHANNEL_EMAIL,
            idempotency_key="dispatch-retry-1",
            status=NotificationDispatch.STATUS_DEAD_LETTER,
            payload={},
            error_message="boom",
        )

        call_command("retry_notification_dispatches", "--channel", "EMAIL", "--limit", "10")

        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, NotificationDispatch.STATUS_PENDING)
        self.assertEqual(dispatch.error_message, "")
