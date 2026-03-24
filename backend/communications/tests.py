from django.test import TestCase
from django.test import override_settings
from django.db.utils import OperationalError
from django.core.management import call_command
import hashlib
import hmac
import json
import tempfile
from pathlib import Path
from io import StringIO
from unittest.mock import patch
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from notifications.models import Notification, NotificationType
from notifications.tasks import send_notification_whatsapp_task

from .email_service import send_email
from .models import (
	EmailDelivery,
	EmailEvent,
	EmailPreference,
	EmailPreferenceAudit,
	EmailSuppression,
	EmailTemplate,
	MailgunSettingsAudit,
	WhatsAppContact,
	WhatsAppDelivery,
	WhatsAppEvent,
	WhatsAppSettings,
	WhatsAppTemplateMap,
)
from .whatsapp_service import send_whatsapp_notification
from .code_managed_templates import reset_code_managed_template_cache
from .preferences import build_unsubscribe_token


User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailServiceTests(TestCase):
	def test_send_email_creates_sent_delivery(self):
		result = send_email(
			recipient_email="test@example.com",
			subject="Hola",
			body_text="Mensaje",
			category="transactional",
		)

		self.assertTrue(result.sent)
		self.assertEqual(EmailDelivery.objects.count(), 1)
		delivery = EmailDelivery.objects.first()
		self.assertIsNotNone(delivery)
		self.assertEqual(delivery.status, EmailDelivery.STATUS_SENT)

	def test_send_email_idempotency_skips_duplicate(self):
		key = "forgot-password:user:1:token:abc"

		first = send_email(
			recipient_email="test@example.com",
			subject="Reset",
			body_text="Primer envio",
			category="transactional",
			idempotency_key=key,
		)
		second = send_email(
			recipient_email="test@example.com",
			subject="Reset",
			body_text="Segundo envio",
			category="transactional",
			idempotency_key=key,
		)

		self.assertTrue(first.sent)
		self.assertFalse(second.sent)
		self.assertEqual(EmailDelivery.objects.count(), 1)

	def test_send_email_skips_suppressed_recipient(self):
		EmailSuppression.objects.create(
			email="suppressed@example.com",
			reason=EmailSuppression.REASON_COMPLAINT,
		)

		result = send_email(
			recipient_email="suppressed@example.com",
			subject="Bloqueado",
			body_text="No debe enviarse",
			category="transactional",
		)

		self.assertFalse(result.sent)
		self.assertEqual(result.delivery.status, EmailDelivery.STATUS_SUPPRESSED)

	def test_send_email_emits_structured_log_events(self):
		with self.assertLogs("communications.email_service", level="INFO") as captured:
			send_email(
				recipient_email="log@example.com",
				subject="Log test",
				body_text="Log body",
				category="transactional",
				idempotency_key="log-key-1",
			)

		joined = "\n".join(captured.output)
		self.assertIn("channel.email.send.start", joined)
		self.assertIn("channel.email.send.result", joined)

	@override_settings(KAMPUS_BACKEND_BASE_URL="http://localhost:8000")
	def test_marketing_email_requires_opt_in_and_allows_transactional_when_unsubscribed(self):
		EmailPreference.objects.create(
			email="marketing@example.com",
			marketing_opt_in=False,
		)
		EmailSuppression.objects.create(
			email="marketing@example.com",
			reason=EmailSuppression.REASON_UNSUBSCRIBED,
		)

		marketing_result = send_email(
			recipient_email="marketing@example.com",
			subject="Promo",
			body_text="Contenido promocional",
			category="marketing-news",
		)
		self.assertFalse(marketing_result.sent)
		self.assertEqual(marketing_result.delivery.status, EmailDelivery.STATUS_SUPPRESSED)

		transactional_result = send_email(
			recipient_email="marketing@example.com",
			subject="Reset",
			body_text="Correo transaccional",
			category="password-reset",
		)
		self.assertTrue(transactional_result.sent)


@override_settings(
	MAILGUN_WEBHOOK_SIGNING_KEY="test-signing-key",
	MAILGUN_WEBHOOK_STRICT=True,
	EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class MailgunWebhookTests(TestCase):
	def _signature_payload(self, payload: dict, *, timestamp: str = "1700000000", token: str = "token-1") -> dict:
		signature = hmac.new(
			b"test-signing-key",
			msg=f"{timestamp}{token}".encode("utf-8"),
			digestmod=hashlib.sha256,
		).hexdigest()
		payload["signature"] = {
			"timestamp": timestamp,
			"token": token,
			"signature": signature,
		}
		return payload

	def test_mailgun_failed_event_creates_suppression_and_blocks_future_send(self):
		# Prepare sent delivery to link incoming provider message id
		result = send_email(
			recipient_email="hardbounce@example.com",
			subject="Initial",
			body_text="Test",
			category="transactional",
		)
		self.assertTrue(result.sent)

		provider_message_id = result.delivery.provider_message_id or "msg-123"
		if not result.delivery.provider_message_id:
			result.delivery.provider_message_id = provider_message_id
			result.delivery.save(update_fields=["provider_message_id", "updated_at"])

		payload = self._signature_payload(
			{
				"event-data": {
					"id": "evt-1",
					"event": "failed",
					"recipient": "hardbounce@example.com",
					"severity": "permanent",
					"message": {
						"headers": {"message-id": f"<{provider_message_id}>"},
					},
				}
			}
		)

		response = self.client.post(
			"/api/communications/webhooks/mailgun/",
			data=payload,
			content_type="application/json",
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(EmailEvent.objects.count(), 1)

		suppression = EmailSuppression.objects.filter(email="hardbounce@example.com").first()
		self.assertIsNotNone(suppression)
		self.assertEqual(suppression.reason, EmailSuppression.REASON_HARD_BOUNCE)

		after = send_email(
			recipient_email="hardbounce@example.com",
			subject="Should be suppressed",
			body_text="Body",
		)
		self.assertFalse(after.sent)
		self.assertEqual(after.delivery.status, EmailDelivery.STATUS_SUPPRESSED)

	def test_mailgun_event_id_is_idempotent(self):
		payload = self._signature_payload(
			{
				"event-data": {
					"id": "evt-duplicate",
					"event": "complained",
					"recipient": "dup@example.com",
				}
			}
		)

		first = self.client.post(
			"/api/communications/webhooks/mailgun/",
			data=payload,
			content_type="application/json",
		)
		second = self.client.post(
			"/api/communications/webhooks/mailgun/",
			data=payload,
			content_type="application/json",
		)

		self.assertEqual(first.status_code, 200)
		self.assertEqual(second.status_code, 200)
		self.assertEqual(EmailEvent.objects.filter(provider_event_id="evt-duplicate").count(), 1)


@override_settings(
	EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
	KAMPUS_BACKEND_BASE_URL="http://localhost:8000",
)
class CommunicationPreferencesTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username="prefs_user",
			email="prefs@example.com",
			password="pass1234",
			role=User.ROLE_ADMIN,
		)
		self.client_api = APIClient()
		self.client_api.force_authenticate(user=self.user)

	def test_preference_me_endpoint_updates_marketing_opt_in(self):
		get_response = self.client_api.get("/api/communications/preferences/me/")
		self.assertEqual(get_response.status_code, 200)
		self.assertFalse(get_response.data["marketing_opt_in"])

		put_response = self.client_api.put(
			"/api/communications/preferences/me/",
			{"marketing_opt_in": True},
			format="json",
		)
		self.assertEqual(put_response.status_code, 200)
		self.assertTrue(put_response.data["marketing_opt_in"])
		self.assertEqual(EmailPreferenceAudit.objects.count(), 1)

	def test_one_click_unsubscribe_sets_opt_out_and_suppression(self):
		EmailPreference.objects.create(email="prefs@example.com", user=self.user, marketing_opt_in=True)
		token = build_unsubscribe_token(email="prefs@example.com")

		response = self.client.get(f"/api/communications/unsubscribe/one-click/?token={token}")
		self.assertEqual(response.status_code, 200)

		preference = EmailPreference.objects.get(email="prefs@example.com")
		self.assertFalse(preference.marketing_opt_in)
		suppression = EmailSuppression.objects.get(email="prefs@example.com")
		self.assertEqual(suppression.reason, EmailSuppression.REASON_UNSUBSCRIBED)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class MailSettingsAdminTests(TestCase):
	def setUp(self):
		self.admin_user = User.objects.create_user(
			username="admin_mail_settings",
			email="admin@example.com",
			password="pass1234",
			role=User.ROLE_ADMIN,
		)
		self.teacher_user = User.objects.create_user(
			username="teacher_mail_settings",
			email="teacher@example.com",
			password="pass1234",
			role=User.ROLE_TEACHER,
		)

		self.admin_client = APIClient()
		self.admin_client.force_authenticate(user=self.admin_user)

		self.teacher_client = APIClient()
		self.teacher_client.force_authenticate(user=self.teacher_user)

	def test_only_admin_can_read_mail_settings(self):
		admin_response = self.admin_client.get("/api/communications/settings/mailgun/")
		self.assertEqual(admin_response.status_code, 200)

		teacher_response = self.teacher_client.get("/api/communications/settings/mailgun/")
		self.assertEqual(teacher_response.status_code, 403)

		audit_teacher_response = self.teacher_client.get("/api/communications/settings/mailgun/audits/")
		self.assertEqual(audit_teacher_response.status_code, 403)

	def test_admin_updates_mail_settings_and_response_masks_secrets(self):
		response = self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "mailgun",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "key-test-123456",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.eu.mailgun.net",
				"mailgun_webhook_signing_key": "sign-123456",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["kampus_email_backend"], "mailgun")
		self.assertTrue(response.data["mailgun_api_key_configured"])
		self.assertTrue(response.data["mailgun_webhook_signing_key_configured"])
		self.assertNotEqual(response.data["mailgun_api_key_masked"], "")
		self.assertNotIn("key-test-123456", response.data["mailgun_api_key_masked"])

		audit = MailgunSettingsAudit.objects.first()
		self.assertIsNotNone(audit)
		self.assertTrue(audit.rotated_api_key)
		self.assertTrue(audit.rotated_webhook_signing_key)
		self.assertIn("mailgun_api_key", list(audit.changed_fields))
		self.assertIn("mailgun_webhook_signing_key", list(audit.changed_fields))

	def test_admin_can_send_test_email(self):
		update_response = self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "console",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "",
				"mailgun_sender_domain": "",
				"mailgun_api_url": "",
				"mailgun_webhook_signing_key": "",
				"mailgun_webhook_strict": False,
			},
			format="json",
		)
		self.assertEqual(update_response.status_code, 200)

		test_response = self.admin_client.post(
			"/api/communications/settings/mailgun/test/",
			{"test_email": "qa@example.com"},
			format="json",
		)
		self.assertEqual(test_response.status_code, 200)
		self.assertEqual(EmailDelivery.objects.filter(recipient_email="qa@example.com").count(), 1)

	def test_mail_settings_are_isolated_by_environment(self):
		dev_update = self.admin_client.put(
			"/api/communications/settings/mailgun/?environment=development",
			{
				"kampus_email_backend": "console",
				"default_from_email": "dev-no-reply@kampus.test",
				"server_email": "dev-server@kampus.test",
				"mailgun_api_key": "",
				"mailgun_sender_domain": "",
				"mailgun_api_url": "",
				"mailgun_webhook_signing_key": "",
				"mailgun_webhook_strict": False,
			},
			format="json",
		)
		self.assertEqual(dev_update.status_code, 200)

		prod_update = self.admin_client.put(
			"/api/communications/settings/mailgun/?environment=production",
			{
				"kampus_email_backend": "console",
				"default_from_email": "prod-no-reply@kampus.test",
				"server_email": "prod-server@kampus.test",
				"mailgun_api_key": "",
				"mailgun_sender_domain": "",
				"mailgun_api_url": "",
				"mailgun_webhook_signing_key": "",
				"mailgun_webhook_strict": False,
			},
			format="json",
		)
		self.assertEqual(prod_update.status_code, 200)

		dev_read = self.admin_client.get("/api/communications/settings/mailgun/?environment=development")
		prod_read = self.admin_client.get("/api/communications/settings/mailgun/?environment=production")

		self.assertEqual(dev_read.status_code, 200)
		self.assertEqual(prod_read.status_code, 200)
		self.assertEqual(dev_read.data["environment"], "development")
		self.assertEqual(prod_read.data["environment"], "production")
		self.assertEqual(dev_read.data["default_from_email"], "dev-no-reply@kampus.test")
		self.assertEqual(prod_read.data["default_from_email"], "prod-no-reply@kampus.test")

	def test_second_update_without_secret_values_keeps_flags_false(self):
		self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "mailgun",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "key-test-123456",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.mailgun.net",
				"mailgun_webhook_signing_key": "sign-123456",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)

		response = self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "mailgun",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.mailgun.net",
				"mailgun_webhook_signing_key": "",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)

		self.assertEqual(response.status_code, 200)
		audit = MailgunSettingsAudit.objects.order_by("-created_at").first()
		self.assertIsNotNone(audit)
		self.assertFalse(audit.rotated_api_key)
		self.assertFalse(audit.rotated_webhook_signing_key)

	def test_admin_can_list_mail_settings_audits(self):
		self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "mailgun",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "key-audit-123456",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.mailgun.net",
				"mailgun_webhook_signing_key": "sign-audit-123456",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)
		self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "console",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.mailgun.net",
				"mailgun_webhook_signing_key": "",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)

		response = self.admin_client.get("/api/communications/settings/mailgun/audits/?limit=1&offset=1")
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data.get("limit"), 1)
		self.assertEqual(response.data.get("offset"), 1)
		self.assertTrue(response.data.get("total", 0) >= 2)
		self.assertEqual(len(response.data.get("results", [])), 1)

		first = response.data["results"][0]
		self.assertIn("changed_fields", first)
		self.assertIn("updated_by", first)
		self.assertEqual(first["updated_by"]["id"], self.admin_user.id)

	def test_admin_can_export_mail_settings_audits_csv(self):
		self.admin_client.put(
			"/api/communications/settings/mailgun/",
			{
				"kampus_email_backend": "mailgun",
				"default_from_email": "no-reply@kampus.test",
				"server_email": "server@kampus.test",
				"mailgun_api_key": "key-csv-123456",
				"mailgun_sender_domain": "mg.kampus.test",
				"mailgun_api_url": "https://api.mailgun.net",
				"mailgun_webhook_signing_key": "sign-csv-123456",
				"mailgun_webhook_strict": True,
			},
			format="json",
		)

		response = self.admin_client.get("/api/communications/settings/mailgun/audits/export/")
		self.assertEqual(response.status_code, 200)
		self.assertIn("text/csv", str(response.get("Content-Type", "")))
		self.assertIn("mailgun_audits.csv", str(response.get("Content-Disposition", "")))
		self.assertIn("changed_fields", str(response.content.decode("utf-8")))

		forbidden = self.teacher_client.get("/api/communications/settings/mailgun/audits/export/")
		self.assertEqual(forbidden.status_code, 403)

	def test_admin_can_read_notifications_baseline_and_teacher_cannot(self):
		EmailDelivery.objects.create(
			recipient_email="base@example.com",
			subject="base",
			body_text="base",
			status=EmailDelivery.STATUS_SENT,
		)
		WhatsAppDelivery.objects.create(
			recipient_phone="+573000000001",
			status=WhatsAppDelivery.STATUS_DELIVERED,
		)

		admin_response = self.admin_client.get("/api/communications/settings/notifications/baseline/?hours=24&types_days=30")
		self.assertEqual(admin_response.status_code, 200)
		self.assertIn("whatsapp", admin_response.data)
		self.assertIn("email", admin_response.data)
		self.assertIn("notification_types", admin_response.data)
		self.assertIn("dispatch_outbox", admin_response.data)

		teacher_response = self.teacher_client.get("/api/communications/settings/notifications/baseline/")
		self.assertEqual(teacher_response.status_code, 403)

	def test_email_templates_sync_endpoint_admin_only_and_supports_dry_run(self):
		with tempfile.TemporaryDirectory() as tmpdir:
			artifact_path = Path(tmpdir) / "templates.json"
			artifact_path.write_text(
				json.dumps(
					{
						"templates": [
							{
								"slug": "mail-settings-test",
								"name": "Correo prueba",
								"description": "sync test",
								"templateType": "transactional",
								"category": "transactional",
								"allowedVariables": ["environment"],
								"subjectTemplate": "Test",
								"bodyTextTemplate": "{{ environment }}",
								"bodyHtmlTemplate": "<p>{{ environment }}</p>",
							}
						]
					}
				),
				encoding="utf-8",
			)

			forbidden = self.teacher_client.post(
				"/api/communications/settings/email-templates/sync/",
				{"dry_run": True, "artifact_path": str(artifact_path)},
				format="json",
			)
			self.assertEqual(forbidden.status_code, 403)

			with override_settings(KAMPUS_EMAIL_TEMPLATES_ARTIFACT_PATH=str(artifact_path)):
				reset_code_managed_template_cache()
				response = self.admin_client.post(
					"/api/communications/settings/email-templates/sync/",
					{"dry_run": True},
					format="json",
				)
				self.assertEqual(response.status_code, 200)
				self.assertIn("[DRY-RUN]", response.data.get("detail", ""))
				self.assertEqual(int(response.data["summary"]["templates_count"]), 1)
				self.assertEqual(EmailTemplate.objects.filter(slug="mail-settings-test").count(), 0)
				reset_code_managed_template_cache()


class EmailTemplateCodeManagedLockTests(TestCase):
	def setUp(self):
		self.admin_user = User.objects.create_user(
			username="admin_email_templates",
			email="admin-templates@example.com",
			password="pass1234",
			role=User.ROLE_ADMIN,
		)
		self.client_api = APIClient()
		self.client_api.force_authenticate(user=self.admin_user)

	def test_put_blocks_manual_edit_for_code_managed_slug(self):
		with tempfile.TemporaryDirectory() as tmpdir:
			artifact_path = Path(tmpdir) / "templates.json"
			artifact_path.write_text(
				json.dumps(
					{
						"templates": [
							{
								"slug": "password-reset",
								"name": "Reset",
								"description": "",
								"templateType": "transactional",
								"category": "password-reset",
								"allowedVariables": ["reset_url"],
								"subjectTemplate": "Reset",
								"bodyTextTemplate": "{{ reset_url }}",
								"bodyHtmlTemplate": "<p>{{ reset_url }}</p>",
							}
						]
					}
				),
				encoding="utf-8",
			)

			EmailTemplate.objects.create(
				slug="password-reset",
				name="Original",
				template_type=EmailTemplate.TYPE_TRANSACTIONAL,
				category="password-reset",
				subject_template="Original",
				body_text_template="Original",
				body_html_template="<p>Original</p>",
			)

			with override_settings(KAMPUS_EMAIL_TEMPLATES_ARTIFACT_PATH=str(artifact_path)):
				reset_code_managed_template_cache()
				response = self.client_api.put(
					"/api/communications/settings/email-templates/password-reset/",
					{
						"slug": "password-reset",
						"name": "Intento manual",
						"template_type": "transactional",
						"category": "password-reset",
						"subject_template": "Intento manual",
						"body_text_template": "Manual",
						"body_html_template": "<p>Manual</p>",
						"allowed_variables": ["reset_url"],
						"is_active": True,
					},
					format="json",
				)
				self.assertEqual(response.status_code, 409)
				self.assertIn("gestionado por codigo", response.data.get("detail", ""))

				template = EmailTemplate.objects.get(slug="password-reset")
				self.assertEqual(template.name, "Original")

				reset_code_managed_template_cache()

	def test_get_template_includes_managed_by_code_flag(self):
		with tempfile.TemporaryDirectory() as tmpdir:
			artifact_path = Path(tmpdir) / "templates.json"
			artifact_path.write_text(
				json.dumps(
					{
						"templates": [
							{
								"slug": "mail-settings-test",
								"name": "Test",
								"description": "",
								"templateType": "transactional",
								"category": "transactional",
								"allowedVariables": ["environment"],
								"subjectTemplate": "Test",
								"bodyTextTemplate": "{{ environment }}",
								"bodyHtmlTemplate": "<p>{{ environment }}</p>",
							}
						]
					}
				),
				encoding="utf-8",
			)

			EmailTemplate.objects.create(
				slug="mail-settings-test",
				name="Correo de prueba",
				template_type=EmailTemplate.TYPE_TRANSACTIONAL,
				category="transactional",
				subject_template="Correo",
				body_text_template="Texto",
				body_html_template="<p>Html</p>",
			)

			with override_settings(KAMPUS_EMAIL_TEMPLATES_ARTIFACT_PATH=str(artifact_path)):
				reset_code_managed_template_cache()
				response = self.client_api.get("/api/communications/settings/email-templates/mail-settings-test/")
				self.assertEqual(response.status_code, 200)
				self.assertTrue(response.data.get("managed_by_code"))

				reset_code_managed_template_cache()


class NotificationsBaselineCommandTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username="baseline_user",
			email="baseline@example.com",
			password="pass1234",
			role=User.ROLE_ADMIN,
		)

	def test_notifications_baseline_snapshot_command_outputs_expected_shape(self):
		Notification.objects.create(
			recipient=self.user,
			title="N1",
			body="B1",
			type="NOVELTY_SLA_TEACHER",
			dedupe_key="base:notif:1",
		)
		EmailDelivery.objects.create(
			recipient_email="cmd@example.com",
			subject="cmd",
			body_text="cmd",
			status=EmailDelivery.STATUS_SENT,
		)
		WhatsAppDelivery.objects.create(
			recipient_phone="+573000000002",
			status=WhatsAppDelivery.STATUS_FAILED,
			error_code="131000",
		)

		output = StringIO()
		call_command("notifications_baseline_snapshot", "--hours", "24", "--types-days", "30", stdout=output)
		payload = json.loads(output.getvalue().strip())

		self.assertEqual(payload["window_hours"], 24)
		self.assertEqual(payload["types_window_days"], 30)
		self.assertIn("whatsapp", payload)
		self.assertIn("email", payload)
		self.assertIn("notification_types", payload)
		self.assertIn("dispatch_outbox", payload)
		self.assertTrue(isinstance(payload["notification_types"]["top_volume"], list))


@override_settings(
	KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN="verify-me",
	KAMPUS_WHATSAPP_APP_SECRET="test-app-secret",
	KAMPUS_WHATSAPP_WEBHOOK_STRICT=True,
)
class WhatsAppChannelTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username="wa_user",
			email="wa@example.com",
			password="pass1234",
			role=User.ROLE_TEACHER,
		)
		self.api_client = APIClient()
		self.api_client.force_authenticate(user=self.user)

	def _sign_payload(self, payload: dict) -> tuple[str, str]:
		raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
		signature = hmac.new(
			b"test-app-secret",
			msg=raw,
			digestmod=hashlib.sha256,
		).hexdigest()
		return raw.decode("utf-8"), f"sha256={signature}"

	def test_whatsapp_contact_me_crud(self):
		initial = self.api_client.get("/api/communications/whatsapp/me/")
		self.assertEqual(initial.status_code, 200)
		self.assertFalse(initial.data["has_contact"])

		create = self.api_client.put(
			"/api/communications/whatsapp/me/",
			{"phone_number": "3001234567"},
			format="json",
		)
		self.assertEqual(create.status_code, 200)
		self.assertTrue(create.data["has_contact"])
		self.assertEqual(create.data["phone_number"], "+573001234567")

		contact = WhatsAppContact.objects.get(user=self.user)
		self.assertTrue(contact.is_active)
		self.assertEqual(contact.phone_number, "+573001234567")

		delete = self.api_client.delete("/api/communications/whatsapp/me/")
		self.assertEqual(delete.status_code, 200)

		contact.refresh_from_db()
		self.assertFalse(contact.is_active)

	def test_preferences_me_includes_whatsapp_summary(self):
		WhatsAppContact.objects.create(user=self.user, phone_number="+573001234500", is_active=True)

		response = self.api_client.get("/api/communications/preferences/me/")
		self.assertEqual(response.status_code, 200)
		self.assertIn("whatsapp", response.data)
		self.assertTrue(response.data["whatsapp"]["has_contact"])
		self.assertEqual(response.data["whatsapp"]["phone_number"], "+573001234500")

	def test_whatsapp_webhook_verification_and_status_update(self):
		verify = self.client.get(
			"/api/communications/webhooks/whatsapp/meta/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123"
		)
		self.assertEqual(verify.status_code, 200)
		self.assertEqual(verify.content.decode("utf-8"), "abc123")

		delivery = WhatsAppDelivery.objects.create(
			recipient_phone="+573001234567",
			message_text="Hola",
			status=WhatsAppDelivery.STATUS_SENT,
			provider_message_id="wamid.HBgLTEST123",
		)

		payload = {
			"object": "whatsapp_business_account",
			"entry": [
				{
					"changes": [
						{
							"field": "messages",
							"value": {
								"statuses": [
									{
										"id": "wamid.HBgLTEST123",
										"status": "delivered",
										"recipient_id": "573001234567",
									}
								]
							},
						}
					]
				}
			],
		}

		raw_payload, signature = self._sign_payload(payload)
		with patch("communications.views._is_valid_whatsapp_signature", return_value=True):
			response = self.client.generic(
				"POST",
				"/api/communications/webhooks/whatsapp/meta/",
				raw_payload,
				content_type="application/json",
				HTTP_X_HUB_SIGNATURE_256=signature,
			)
		self.assertEqual(response.status_code, 200)

		delivery.refresh_from_db()
		self.assertEqual(delivery.status, WhatsAppDelivery.STATUS_DELIVERED)
		self.assertEqual(WhatsAppEvent.objects.count(), 1)


@override_settings(KAMPUS_WHATSAPP_ENABLED=True)
class WhatsAppTemplateAndHealthAdminTests(TestCase):
	def setUp(self):
		self.superadmin_user = User.objects.create_user(
			username="superadmin_whatsapp_settings",
			email="superadmin.whatsapp@example.com",
			password="pass1234",
			role=User.ROLE_SUPERADMIN,
		)
		self.admin_user = User.objects.create_user(
			username="admin_whatsapp_settings",
			email="admin.whatsapp@example.com",
			password="pass1234",
			role=User.ROLE_ADMIN,
		)
		self.teacher_user = User.objects.create_user(
			username="teacher_whatsapp_settings",
			email="teacher.whatsapp@example.com",
			password="pass1234",
			role=User.ROLE_TEACHER,
		)
		self.admin_client = APIClient()
		self.admin_client.force_authenticate(user=self.admin_user)
		self.superadmin_client = APIClient()
		self.superadmin_client.force_authenticate(user=self.superadmin_user)
		self.teacher_client = APIClient()
		self.teacher_client.force_authenticate(user=self.teacher_user)

	def test_admin_can_manage_whatsapp_template_maps(self):
		forbidden = self.teacher_client.put(
			"/api/communications/settings/whatsapp/templates/",
			{
				"notification_type": "NOVELTY_SLA_ADMIN",
				"template_name": "novelty_sla_admin_v1",
				"language_code": "es_CO",
				"category": "utility",
				"is_active": True,
			},
			format="json",
		)
		self.assertEqual(forbidden.status_code, 403)

		upsert = self.admin_client.put(
			"/api/communications/settings/whatsapp/templates/",
			{
				"notification_type": "NOVELTY_SLA_ADMIN",
				"template_name": "novelty_sla_admin_v1",
				"language_code": "es_CO",
				"category": "utility",
				"is_active": True,
			},
			format="json",
		)
		self.assertEqual(upsert.status_code, 200)
		map_id = upsert.data["id"]
		self.assertEqual(upsert.data["approval_status"], WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT)

		submit = self.admin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/submit/",
			{},
			format="json",
		)
		self.assertEqual(submit.status_code, 200)
		self.assertEqual(submit.data["approval_status"], WhatsAppTemplateMap.APPROVAL_STATUS_SUBMITTED)

		forbidden_approve = self.admin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/approve/",
			{},
			format="json",
		)
		self.assertEqual(forbidden_approve.status_code, 403)

		approved = self.superadmin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/approve/",
			{},
			format="json",
		)
		self.assertEqual(approved.status_code, 200)
		self.assertEqual(approved.data["approval_status"], WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED)

		list_response = self.admin_client.get("/api/communications/settings/whatsapp/templates/")
		self.assertEqual(list_response.status_code, 200)
		self.assertEqual(len(list_response.data["results"]), 1)

		update = self.admin_client.put(
			f"/api/communications/settings/whatsapp/templates/{map_id}/",
			{"template_name": "novelty_sla_admin_v2", "is_active": False},
			format="json",
		)
		self.assertEqual(update.status_code, 200)
		self.assertEqual(update.data["template_name"], "novelty_sla_admin_v2")
		self.assertFalse(update.data["is_active"])
		self.assertEqual(update.data["approval_status"], WhatsAppTemplateMap.APPROVAL_STATUS_DRAFT)

		reject_requires_submit = self.superadmin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/reject/",
			{"reason": "Formato inválido"},
			format="json",
		)
		self.assertEqual(reject_requires_submit.status_code, 400)

		submit_again = self.admin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/submit/",
			{},
			format="json",
		)
		self.assertEqual(submit_again.status_code, 200)

		reject = self.superadmin_client.post(
			f"/api/communications/settings/whatsapp/templates/{map_id}/reject/",
			{"reason": "Copys no aprobados"},
			format="json",
		)
		self.assertEqual(reject.status_code, 200)
		self.assertEqual(reject.data["approval_status"], WhatsAppTemplateMap.APPROVAL_STATUS_REJECTED)

		delete = self.admin_client.delete(f"/api/communications/settings/whatsapp/templates/{map_id}/")
		self.assertEqual(delete.status_code, 204)
		self.assertEqual(WhatsAppTemplateMap.objects.count(), 0)

	def test_admin_can_export_whatsapp_template_approvals_csv(self):
		item = WhatsAppTemplateMap.objects.create(
			notification_type="NOVELTY_SLA_ADMIN",
			template_name="novelty_sla_admin_v1",
			language_code="es_CO",
			category="utility",
			is_active=True,
			approval_status=WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
		)
		item.submitted_by = self.admin_user
		item.approved_by = self.superadmin_user
		item.save(update_fields=["submitted_by", "approved_by", "updated_at"])

		response = self.admin_client.get("/api/communications/settings/whatsapp/templates/export/?approval_status=approved")
		self.assertEqual(response.status_code, 200)
		self.assertIn("text/csv", response.get("Content-Type", ""))
		self.assertIn("NOVELTY_SLA_ADMIN", response.content.decode("utf-8"))

		forbidden = self.teacher_client.get("/api/communications/settings/whatsapp/templates/export/")
		self.assertEqual(forbidden.status_code, 403)

	def test_admin_whatsapp_health_endpoint(self):
		WhatsAppDelivery.objects.create(recipient_phone="+573001234501", status=WhatsAppDelivery.STATUS_SENT)
		WhatsAppDelivery.objects.create(recipient_phone="+573001234502", status=WhatsAppDelivery.STATUS_DELIVERED)
		WhatsAppDelivery.objects.create(recipient_phone="+573001234503", status=WhatsAppDelivery.STATUS_FAILED, error_code="130429")

		response = self.admin_client.get("/api/communications/settings/whatsapp/health/?hours=24")
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["totals"]["total"], 3)
		self.assertEqual(response.data["totals"]["failed"], 1)
		self.assertIn("top_error_codes", response.data)

		forbidden = self.teacher_client.get("/api/communications/settings/whatsapp/health/")
		self.assertEqual(forbidden.status_code, 403)

	def test_admin_can_manage_whatsapp_settings(self):
		forbidden = self.teacher_client.put(
			"/api/communications/settings/whatsapp/",
			{
				"enabled": True,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "987654321",
				"access_token": "token-teacher",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "template",
			},
			format="json",
		)
		self.assertEqual(forbidden.status_code, 403)

		response = self.admin_client.put(
			"/api/communications/settings/whatsapp/?environment=development",
			{
				"enabled": True,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "123456789",
				"access_token": "token-admin",
				"app_secret": "app-secret-admin",
				"webhook_verify_token": "verify-admin",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "template",
				"template_fallback_name": "fallback_template",
				"template_sla_warning_pending_hours": 12,
				"template_sla_critical_pending_hours": 48,
				"template_sla_warning_approval_hours": 18,
				"template_sla_critical_approval_hours": 72,
			},
			format="json",
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["environment"], "development")
		self.assertTrue(response.data["enabled"])
		self.assertTrue(response.data["access_token_configured"])
		self.assertEqual(response.data["template_sla_warning_pending_hours"], 12)
		self.assertEqual(response.data["template_sla_critical_pending_hours"], 48)
		self.assertEqual(response.data["updated_by"]["id"], self.admin_user.id)

		stored = WhatsAppSettings.objects.get(environment="development")
		self.assertEqual(stored.phone_number_id, "123456789")
		self.assertEqual(stored.send_mode, "template")
		self.assertEqual(stored.template_sla_warning_pending_hours, 12)
		self.assertEqual(stored.template_sla_critical_pending_hours, 48)

		prod_response = self.admin_client.put(
			"/api/communications/settings/whatsapp/?environment=production",
			{
				"enabled": True,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "999999999",
				"access_token": "token-prod",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "text",
			},
			format="json",
		)
		self.assertEqual(prod_response.status_code, 200)
		self.assertEqual(prod_response.data["send_mode"], "template")

	def test_whatsapp_settings_reject_invalid_sla_threshold_order(self):
		response = self.admin_client.put(
			"/api/communications/settings/whatsapp/?environment=development",
			{
				"enabled": False,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "",
				"access_token": "",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "template",
				"template_sla_warning_pending_hours": 80,
				"template_sla_critical_pending_hours": 24,
				"template_sla_warning_approval_hours": 24,
				"template_sla_critical_approval_hours": 72,
			},
			format="json",
		)
		self.assertEqual(response.status_code, 400)
		self.assertIn("warning_pending_hours", response.data["detail"])

	def test_whatsapp_template_sla_audit_created_and_exportable(self):
		self.admin_client.put(
			"/api/communications/settings/whatsapp/?environment=development",
			{
				"enabled": False,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "",
				"access_token": "",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "template",
				"template_sla_warning_pending_hours": 24,
				"template_sla_critical_pending_hours": 72,
				"template_sla_warning_approval_hours": 24,
				"template_sla_critical_approval_hours": 72,
			},
			format="json",
		)

		update = self.admin_client.put(
			"/api/communications/settings/whatsapp/?environment=development",
			{
				"enabled": False,
				"provider": "meta_cloud_api",
				"graph_base_url": "https://graph.facebook.com",
				"api_version": "v21.0",
				"phone_number_id": "",
				"access_token": "",
				"webhook_strict": True,
				"http_timeout_seconds": 15,
				"send_mode": "template",
				"template_sla_warning_pending_hours": 12,
				"template_sla_critical_pending_hours": 48,
				"template_sla_warning_approval_hours": 18,
				"template_sla_critical_approval_hours": 60,
			},
			format="json",
		)
		self.assertEqual(update.status_code, 200)

		list_response = self.admin_client.get("/api/communications/settings/whatsapp/template-sla-audits/?environment=development")
		self.assertEqual(list_response.status_code, 200)
		self.assertGreaterEqual(len(list_response.data["results"]), 1)
		self.assertEqual(list_response.data["results"][0]["new_warning_pending_hours"], 12)

		export_response = self.admin_client.get("/api/communications/settings/whatsapp/template-sla-audits/export/?environment=development")
		self.assertEqual(export_response.status_code, 200)
		self.assertIn("text/csv", export_response.get("Content-Type", ""))
		self.assertIn("new_warning_pending_hours", export_response.content.decode("utf-8"))

		forbidden = self.teacher_client.get("/api/communications/settings/whatsapp/template-sla-audits/")
		self.assertEqual(forbidden.status_code, 403)

	def test_whatsapp_settings_get_handles_db_schema_errors(self):
		with patch("communications.views.WhatsAppSettings.objects.filter", side_effect=OperationalError("missing table")):
			response = self.admin_client.get("/api/communications/settings/whatsapp/?environment=development")

		self.assertEqual(response.status_code, 200)
		self.assertIn("enabled", response.data)

	def test_admin_can_send_whatsapp_test_message(self):
		class _Delivery:
			id = 123
			status = WhatsAppDelivery.STATUS_SENT
			provider_message_id = "wamid.TEST123"
			error_message = ""
			error_code = ""

		class _Result:
			sent = True
			delivery = _Delivery()

		with patch("communications.views.send_whatsapp_template", return_value=_Result()) as mocked_send:
			response = self.admin_client.post(
				"/api/communications/settings/whatsapp/test/?environment=development",
				{
					"test_phone": "+573001112233",
					"template_name": "hello_world",
					"language_code": "en_US",
					"body_parameters": ["one", "two"],
				},
				format="json",
			)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data["status"], WhatsAppDelivery.STATUS_SENT)
		self.assertEqual(response.data["mode"], "template")
		self.assertEqual(response.data["delivery_id"], 123)
		mocked_send.assert_called_once()

	def test_admin_can_list_recent_whatsapp_deliveries(self):
		WhatsAppDelivery.objects.create(recipient_phone="+573001111111", status=WhatsAppDelivery.STATUS_FAILED, error_code="131047", error_message="Re-engagement message")
		WhatsAppDelivery.objects.create(recipient_phone="+573002222222", status=WhatsAppDelivery.STATUS_SENT, provider_message_id="wamid.TEST999")

		response = self.admin_client.get("/api/communications/settings/whatsapp/deliveries/?limit=5")
		self.assertEqual(response.status_code, 200)
		self.assertGreaterEqual(len(response.data["results"]), 2)
		self.assertIn("status", response.data["results"][0])
		self.assertIn("error_code", response.data["results"][0])

		forbidden = self.teacher_client.get("/api/communications/settings/whatsapp/deliveries/?limit=5")
		self.assertEqual(forbidden.status_code, 403)

	def test_non_admin_cannot_send_whatsapp_test_message(self):
		response = self.teacher_client.post(
			"/api/communications/settings/whatsapp/test/?environment=development",
			{
				"test_phone": "+573001112233",
				"message": "Mensaje de prueba",
			},
			format="json",
		)

		self.assertEqual(response.status_code, 403)


@override_settings(
	KAMPUS_WHATSAPP_ENABLED=True,
	KAMPUS_WHATSAPP_SEND_MODE="template",
	KAMPUS_WHATSAPP_PHONE_NUMBER_ID="123",
	KAMPUS_WHATSAPP_ACCESS_TOKEN="token",
	KAMPUS_WHATSAPP_API_VERSION="v21.0",
)
class WhatsAppTemplateSendTests(TestCase):
	def setUp(self):
		WhatsAppSettings.objects.create(
			environment="development",
			enabled=True,
			send_mode="template",
			phone_number_id="123",
			access_token="token",
			webhook_verify_token="verify-me",
			webhook_strict=False,
		)

	def test_send_notification_uses_template_mapping(self):
		WhatsAppTemplateMap.objects.create(
			notification_type="NOVELTY_SLA_ADMIN",
			template_name="novelty_sla_admin_v1",
			language_code="es_CO",
			category="utility",
			is_active=True,
			approval_status=WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
		)

		captured = {}

		def _fake_send(payload):
			captured["payload"] = payload
			return "wamid.TEST123", {"messages": [{"id": "wamid.TEST123"}]}, "", ""

		with patch("communications.whatsapp_service._perform_whatsapp_send", side_effect=_fake_send):
			result = send_whatsapp_notification(
				recipient_phone="+573001234567",
				notification_type="NOVELTY_SLA_ADMIN",
				recipient_name="Admin User",
				title="Titulo",
				body="Cuerpo",
				action_url="https://example.com/notifications/1",
				idempotency_key="wa-test-1",
				fallback_text="fallback",
			)

		self.assertTrue(result.sent)
		payload = captured["payload"]
		self.assertEqual(payload["type"], "template")
		self.assertEqual(payload["template"]["name"], "novelty_sla_admin_v1")


@override_settings(
	KAMPUS_WHATSAPP_ENABLED=True,
	KAMPUS_WHATSAPP_SEND_MODE="template",
	KAMPUS_WHATSAPP_ALLOW_TEXT_WITHOUT_TEMPLATE=False,
)
class WhatsAppPolicySkipTests(TestCase):
	def test_send_notification_skips_when_no_template_and_text_fallback_disabled(self):
		result = send_whatsapp_notification(
			recipient_phone="+573009999999",
			notification_type="TYPE_WITHOUT_MAP",
			recipient_name="User",
			title="Titulo",
			body="Cuerpo",
			action_url="https://example.com/n/1",
			idempotency_key="wa-skip-no-template-1",
			fallback_text="fallback",
		)

		self.assertFalse(result.sent)
		self.assertEqual(result.delivery.status, WhatsAppDelivery.STATUS_SKIPPED)
		self.assertEqual(result.delivery.skip_reason, WhatsAppDelivery.SKIP_REASON_NO_TEMPLATE)

	def test_notification_type_requires_template_forces_skip_even_when_text_fallback_enabled(self):
		NotificationType.objects.create(
			code="TYPE_REQUIRES_TEMPLATE",
			email_enabled=True,
			whatsapp_enabled=True,
			whatsapp_requires_template=True,
		)

		with override_settings(KAMPUS_WHATSAPP_ALLOW_TEXT_WITHOUT_TEMPLATE=True):
			result = send_whatsapp_notification(
				recipient_phone="+573009999998",
				notification_type="TYPE_REQUIRES_TEMPLATE",
				recipient_name="User",
				title="Titulo",
				body="Cuerpo",
				action_url="https://example.com/n/2",
				idempotency_key="wa-skip-requires-template-1",
				fallback_text="fallback",
			)

		self.assertFalse(result.sent)
		self.assertEqual(result.delivery.status, WhatsAppDelivery.STATUS_SKIPPED)
		self.assertEqual(result.delivery.skip_reason, WhatsAppDelivery.SKIP_REASON_NO_TEMPLATE)


@override_settings(
	KAMPUS_WHATSAPP_ENABLED=True,
	KAMPUS_WHATSAPP_SEND_MODE="template",
	KAMPUS_WHATSAPP_PHONE_NUMBER_ID="123",
	KAMPUS_WHATSAPP_ACCESS_TOKEN="token",
	KAMPUS_WHATSAPP_API_VERSION="v21.0",
	KAMPUS_WHATSAPP_WEBHOOK_VERIFY_TOKEN="verify-me",
	KAMPUS_WHATSAPP_APP_SECRET="test-app-secret",
	KAMPUS_WHATSAPP_WEBHOOK_STRICT=True,
)
class WhatsAppNotificationE2ETests(TestCase):
	def setUp(self):
		WhatsAppSettings.objects.create(
			environment="development",
			enabled=True,
			send_mode="template",
			phone_number_id="123",
			access_token="token",
			app_secret="test-app-secret",
			webhook_strict=True,
		)
		self.user = User.objects.create_user(
			username="wa_e2e_user",
			email="wa.e2e@example.com",
			password="pass1234",
			role=User.ROLE_TEACHER,
			first_name="Doc",
			last_name="E2E",
		)
		self.api_client = APIClient()
		self.api_client.force_authenticate(user=self.user)
		WhatsAppContact.objects.create(user=self.user, phone_number="+573001111111", is_active=True)
		WhatsAppTemplateMap.objects.create(
			notification_type="NOVELTY_SLA_ADMIN",
			template_name="novelty_sla_admin_v1",
			language_code="es_CO",
			category="utility",
			is_active=True,
			approval_status=WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
		)

	def _sign_payload(self, payload: dict) -> tuple[str, str]:
		raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
		signature = hmac.new(
			b"test-app-secret",
			msg=raw,
			digestmod=hashlib.sha256,
		).hexdigest()
		return raw.decode("utf-8"), f"sha256={signature}"

	def test_notification_task_and_webhook_updates_delivery(self):
		notification = Notification.objects.create(
			recipient=self.user,
			type="NOVELTY_SLA_ADMIN",
			title="Escalamiento SLA",
			body="Casos pendientes",
			url="https://example.com/notifications/123",
			dedupe_key="wa-e2e-1",
		)

		with patch(
			"communications.whatsapp_service._perform_whatsapp_send",
			return_value=("wamid.E2E123", {"messages": [{"id": "wamid.E2E123"}]}, "", ""),
		):
			send_notification_whatsapp_task(notification.id, idempotency_key="wa-e2e-key-1")

		delivery = WhatsAppDelivery.objects.filter(recipient_phone="+573001111111").first()
		self.assertIsNotNone(delivery)
		self.assertEqual(delivery.status, WhatsAppDelivery.STATUS_SENT)
		self.assertEqual(delivery.provider_message_id, "wamid.E2E123")

		payload = {
			"object": "whatsapp_business_account",
			"entry": [
				{
					"changes": [
						{
							"field": "messages",
							"value": {
								"statuses": [
									{
										"id": "wamid.E2E123",
										"status": "delivered",
										"recipient_id": "573001111111",
									}
								]
							},
						}
					]
				}
			],
		}

		raw_payload, signature = self._sign_payload(payload)
		response = self.client.generic(
			"POST",
			"/api/communications/webhooks/whatsapp/meta/",
			raw_payload,
			content_type="application/json",
			HTTP_X_HUB_SIGNATURE_256=signature,
		)
		self.assertEqual(response.status_code, 200)

		delivery.refresh_from_db()
		self.assertEqual(delivery.status, WhatsAppDelivery.STATUS_DELIVERED)
		self.assertEqual(WhatsAppEvent.objects.filter(provider_message_id="wamid.E2E123").count(), 1)
