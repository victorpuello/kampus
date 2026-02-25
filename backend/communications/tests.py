from django.test import TestCase
from django.test import override_settings
import hashlib
import hmac
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from .email_service import send_email
from .models import (
	EmailDelivery,
	EmailEvent,
	EmailPreference,
	EmailPreferenceAudit,
	EmailSuppression,
	MailgunSettingsAudit,
)
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
