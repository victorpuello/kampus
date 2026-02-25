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
