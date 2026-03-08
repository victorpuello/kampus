import json
from datetime import date, timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from communications.models import EmailDelivery

from .models import Notification, NotificationDispatch, NotificationType, OperationalPlanActivity
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


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=False,
    KAMPUS_WHATSAPP_ENABLED=False,
    TIME_ZONE="America/Bogota",
    USE_TZ=True,
)
class OperationalPlanActivityApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="poa_admin",
            email="poa_admin@example.com",
            password="pass1234",
            role=User.ROLE_ADMIN,
            first_name="Admin",
            last_name="POA",
        )
        self.teacher = User.objects.create_user(
            username="poa_teacher",
            email="poa_teacher@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="POA",
        )
        self.responsible = User.objects.create_user(
            username="poa_responsible",
            email="poa_responsible@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
            first_name="Responsable",
            last_name="Uno",
        )

    def test_admin_can_create_activity_and_teacher_cannot(self):
        payload = {
            "title": "Socialización del cronograma",
            "description": "Reunión institucional",
            "activity_date": "2026-03-14",
            "end_date": "2026-03-16",
            "responsible_user_ids": [self.responsible.id],
            "is_active": True,
        }

        self.client.force_authenticate(user=self.teacher)
        teacher_response = self.client.post("/api/operational-plan-activities/", payload, format="json")
        self.assertEqual(teacher_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        admin_response = self.client.post("/api/operational-plan-activities/", payload, format="json")
        self.assertEqual(admin_response.status_code, status.HTTP_201_CREATED)
        activity = OperationalPlanActivity.objects.get(id=admin_response.data["id"])
        self.assertEqual(activity.created_by_id, self.admin.id)
        self.assertEqual(activity.updated_by_id, self.admin.id)
        self.assertEqual(str(activity.end_date), "2026-03-16")

    def test_create_rejects_end_date_before_start_date(self):
        payload = {
            "title": "Actividad inválida",
            "description": "Rango inválido",
            "activity_date": "2026-03-14",
            "end_date": "2026-03-10",
            "is_active": True,
        }
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/operational-plan-activities/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", response.data)

    def test_create_rejects_non_teacher_responsible(self):
        non_teacher = User.objects.create_user(
            username="poa_admin_responsible",
            email="poa_admin_responsible@example.com",
            password="pass1234",
            role=User.ROLE_ADMIN,
        )
        payload = {
            "title": "Actividad con responsable inválido",
            "description": "Solo docentes",
            "activity_date": "2026-03-14",
            "responsible_user_ids": [non_teacher.id],
            "is_active": True,
        }
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/operational-plan-activities/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("responsible_user_ids", response.data)

    def test_upcoming_allows_teacher_and_validates_invalid_days(self):
        activity = OperationalPlanActivity.objects.create(
            title="Cierre de periodo",
            description="Responsables (texto): Docente POA",
            activity_date=timezone.localdate() + timedelta(days=3),
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )
        activity.responsible_users.add(self.responsible)

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get("/api/operational-plan-activities/upcoming/?days=10&limit=5")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], activity.id)

        invalid_response = self.client.get("/api/operational-plan-activities/upcoming/?days=abc")
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upcoming_includes_ongoing_range_activity(self):
        today = timezone.localdate()
        ongoing = OperationalPlanActivity.objects.create(
            title="Semana institucional",
            description="Actividad de varios días",
            activity_date=today - timedelta(days=1),
            end_date=today + timedelta(days=2),
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get("/api/operational-plan-activities/upcoming/?days=7&limit=10")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(ongoing.id, [item["id"] for item in response.data["results"]])

    def test_list_exposes_mapping_status_fields(self):
        activity = OperationalPlanActivity.objects.create(
            title="Actividad sin mapeo",
            description="Responsables (texto): Sociales",
            activity_date=timezone.localdate() + timedelta(days=9),
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/operational-plan-activities/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data if item["id"] == activity.id)
        self.assertEqual(row["responsables_texto"], "Sociales")
        self.assertTrue(row["responsables_sin_mapear"])

    def test_summary_returns_totals_and_completion_rate(self):
        today = timezone.localdate()
        OperationalPlanActivity.objects.create(
            title="Actividad 1",
            description="",
            activity_date=today,
            is_active=True,
            is_completed=True,
            created_by=self.admin,
            updated_by=self.admin,
            completed_by=self.admin,
            completed_at=timezone.now(),
        )
        OperationalPlanActivity.objects.create(
            title="Actividad 2",
            description="",
            activity_date=today + timedelta(days=1),
            is_active=True,
            is_completed=False,
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/operational-plan-activities/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["completed"], 1)
        self.assertEqual(response.data["pending"], 1)
        self.assertEqual(response.data["completion_rate"], 50.0)

    def test_mark_completed_and_mark_pending(self):
        activity = OperationalPlanActivity.objects.create(
            title="Seguimiento",
            description="",
            activity_date=timezone.localdate(),
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        completed_response = self.client.post(
            f"/api/operational-plan-activities/{activity.id}/mark-completed/",
            {"completion_notes": "Evidencia cargada"},
            format="json",
        )
        self.assertEqual(completed_response.status_code, status.HTTP_200_OK)

        activity.refresh_from_db()
        self.assertTrue(activity.is_completed)
        self.assertIsNotNone(activity.completed_at)
        self.assertEqual(activity.completed_by_id, self.admin.id)
        self.assertEqual(activity.completion_notes, "Evidencia cargada")

        pending_response = self.client.post(
            f"/api/operational-plan-activities/{activity.id}/mark-pending/",
            {},
            format="json",
        )
        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)

        activity.refresh_from_db()
        self.assertFalse(activity.is_completed)
        self.assertIsNone(activity.completed_at)
        self.assertIsNone(activity.completed_by_id)
        self.assertEqual(activity.completion_notes, "")

    @patch("notifications.views.render_pdf_bytes_from_html", return_value=b"%PDF-1.4 mock")
    def test_compliance_report_pdf_returns_pdf_response(self, mocked_pdf_renderer):
        OperationalPlanActivity.objects.create(
            title="Actividad PDF",
            description="",
            activity_date=timezone.localdate(),
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/operational-plan-activities/compliance-report-pdf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("plan_operativo_cumplimiento.pdf", response["Content-Disposition"])
        mocked_pdf_renderer.assert_called_once()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATIONS_EMAIL_ENABLED=False,
    KAMPUS_WHATSAPP_ENABLED=False,
    TIME_ZONE="America/Bogota",
    USE_TZ=True,
)
class OperationalPlanReminderCommandTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="poa_teacher_notify",
            email="poa_teacher_notify@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
            first_name="Docente",
            last_name="Notificar",
        )
        self.responsible = User.objects.create_user(
            username="poa_responsible_notify",
            email="poa_responsible_notify@example.com",
            password="pass1234",
            role=User.ROLE_TEACHER,
            first_name="Coordinador",
            last_name="Académico",
        )
        self.activity = OperationalPlanActivity.objects.create(
            title="Entrega de informes",
            description="Actividad clave",
            activity_date=date(2026, 3, 14),
            is_active=True,
        )
        self.activity.responsible_users.add(self.responsible)

    def test_scheduler_creates_notification_type_and_dedupes_by_activity_user_hito(self):
        with patch("notifications.management.commands.notify_operational_plan_activities.timezone.localdate", return_value=date(2026, 3, 7)):
            call_command("notify_operational_plan_activities")
            call_command("notify_operational_plan_activities")

        notification_type = NotificationType.objects.filter(code="OPERATIONAL_PLAN_REMINDER").first()
        self.assertIsNotNone(notification_type)
        self.assertTrue(notification_type.is_active)

        notifications = Notification.objects.filter(type="OPERATIONAL_PLAN_REMINDER", recipient=self.teacher)
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.first().dedupe_key, f"operational-plan:{self.activity.id}:d7")

    def test_scheduler_does_not_duplicate_when_activity_is_edited_after_notification_same_window(self):
        with patch("notifications.management.commands.notify_operational_plan_activities.timezone.localdate", return_value=date(2026, 3, 7)):
            call_command("notify_operational_plan_activities")

        self.activity.title = "Entrega de informes - versión ajustada"
        self.activity.save(update_fields=["title", "updated_at"])

        with patch("notifications.management.commands.notify_operational_plan_activities.timezone.localdate", return_value=date(2026, 3, 7)):
            call_command("notify_operational_plan_activities")

        notifications = Notification.objects.filter(type="OPERATIONAL_PLAN_REMINDER", recipient=self.teacher)
        self.assertEqual(notifications.count(), 1)
