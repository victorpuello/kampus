from django.db import models


class EmailPreference(models.Model):
	email = models.EmailField(unique=True)
	user = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="email_preferences",
		blank=True,
		null=True,
	)
	marketing_opt_in = models.BooleanField(default=False)
	updated_at = models.DateTimeField(auto_now=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self) -> str:
		return f"{self.email} marketing_opt_in={self.marketing_opt_in}"


class MailgunSettings(models.Model):
	BACKEND_CONSOLE = "console"
	BACKEND_MAILGUN = "mailgun"

	BACKEND_CHOICES = [
		(BACKEND_CONSOLE, "Console"),
		(BACKEND_MAILGUN, "Mailgun"),
	]

	kampus_email_backend = models.CharField(max_length=20, choices=BACKEND_CHOICES, default=BACKEND_CONSOLE)
	default_from_email = models.EmailField(default="no-reply@localhost")
	server_email = models.EmailField(default="no-reply@localhost")
	mailgun_api_key = models.CharField(max_length=255, blank=True, default="")
	mailgun_sender_domain = models.CharField(max_length=255, blank=True, default="")
	mailgun_api_url = models.URLField(blank=True, default="")
	mailgun_webhook_signing_key = models.CharField(max_length=255, blank=True, default="")
	mailgun_webhook_strict = models.BooleanField(default=False)
	updated_by = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="mailgun_settings_updates",
		blank=True,
		null=True,
	)
	updated_at = models.DateTimeField(auto_now=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self) -> str:
		return f"MailgunSettings backend={self.kampus_email_backend}"


class MailgunSettingsAudit(models.Model):
	settings_ref = models.ForeignKey(
		MailgunSettings,
		on_delete=models.SET_NULL,
		related_name="audits",
		blank=True,
		null=True,
	)
	updated_by = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="mailgun_settings_audits",
		blank=True,
		null=True,
	)
	changed_fields = models.JSONField(default=list, blank=True)
	rotated_api_key = models.BooleanField(default=False)
	rotated_webhook_signing_key = models.BooleanField(default=False)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self) -> str:
		return f"MailgunSettingsAudit by={self.updated_by_id or 'system'} at={self.created_at}"


class EmailPreferenceAudit(models.Model):
	SOURCE_USER = "USER"
	SOURCE_SYSTEM = "SYSTEM"
	SOURCE_WEBHOOK = "WEBHOOK"

	SOURCE_CHOICES = [
		(SOURCE_USER, "User"),
		(SOURCE_SYSTEM, "System"),
		(SOURCE_WEBHOOK, "Webhook"),
	]

	preference = models.ForeignKey(EmailPreference, on_delete=models.CASCADE, related_name="audits")
	previous_marketing_opt_in = models.BooleanField()
	new_marketing_opt_in = models.BooleanField()
	source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_SYSTEM)
	notes = models.CharField(max_length=255, blank=True, default="")
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self) -> str:
		return f"{self.preference.email}: {self.previous_marketing_opt_in}->{self.new_marketing_opt_in}"


class EmailDelivery(models.Model):
	STATUS_PENDING = "PENDING"
	STATUS_SENT = "SENT"
	STATUS_FAILED = "FAILED"
	STATUS_SUPPRESSED = "SUPPRESSED"

	STATUS_CHOICES = [
		(STATUS_PENDING, "Pending"),
		(STATUS_SENT, "Sent"),
		(STATUS_FAILED, "Failed"),
		(STATUS_SUPPRESSED, "Suppressed"),
	]

	recipient_email = models.EmailField()
	subject = models.CharField(max_length=255)
	body_text = models.TextField(blank=True, default="")
	body_html = models.TextField(blank=True, default="")
	category = models.CharField(max_length=50, default="transactional")
	provider = models.CharField(max_length=50, default="mailgun")
	provider_message_id = models.CharField(max_length=255, blank=True, default="")
	idempotency_key = models.CharField(max_length=150, blank=True, default="", db_index=True)
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
	error_message = models.TextField(blank=True, default="")
	sent_at = models.DateTimeField(blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]
		constraints = [
			models.UniqueConstraint(
				fields=["recipient_email", "idempotency_key"],
				condition=~models.Q(idempotency_key=""),
				name="communications_unique_email_idempotency",
			)
		]

	def __str__(self) -> str:
		return f"{self.recipient_email} - {self.subject} ({self.status})"


class EmailSuppression(models.Model):
	REASON_HARD_BOUNCE = "HARD_BOUNCE"
	REASON_SOFT_BOUNCE = "SOFT_BOUNCE"
	REASON_COMPLAINT = "COMPLAINT"
	REASON_UNSUBSCRIBED = "UNSUBSCRIBED"

	REASON_CHOICES = [
		(REASON_HARD_BOUNCE, "Hard bounce"),
		(REASON_SOFT_BOUNCE, "Soft bounce"),
		(REASON_COMPLAINT, "Complaint"),
		(REASON_UNSUBSCRIBED, "Unsubscribed"),
	]

	email = models.EmailField(unique=True)
	reason = models.CharField(max_length=30, choices=REASON_CHOICES)
	provider = models.CharField(max_length=50, default="mailgun")
	source_event_id = models.CharField(max_length=255, blank=True, default="")
	failure_count = models.PositiveIntegerField(default=1)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self) -> str:
		return f"{self.email} ({self.reason})"


class EmailEvent(models.Model):
	provider = models.CharField(max_length=50, default="mailgun")
	provider_event_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
	event_type = models.CharField(max_length=50)
	recipient_email = models.EmailField(blank=True, default="")
	provider_message_id = models.CharField(max_length=255, blank=True, default="")
	payload = models.JSONField(default=dict, blank=True)
	processed_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-processed_at"]
		constraints = [
			models.UniqueConstraint(
				fields=["provider", "provider_event_id"],
				condition=~models.Q(provider_event_id=""),
				name="communications_unique_provider_event_id",
			)
		]

	def __str__(self) -> str:
		return f"{self.provider}:{self.event_type}:{self.provider_event_id or self.id}"
