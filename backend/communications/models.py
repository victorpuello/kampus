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
	ENV_DEVELOPMENT = "development"
	ENV_PRODUCTION = "production"

	ENVIRONMENT_CHOICES = [
		(ENV_DEVELOPMENT, "Development"),
		(ENV_PRODUCTION, "Production"),
	]

	BACKEND_CONSOLE = "console"
	BACKEND_MAILGUN = "mailgun"

	BACKEND_CHOICES = [
		(BACKEND_CONSOLE, "Console"),
		(BACKEND_MAILGUN, "Mailgun"),
	]

	environment = models.CharField(max_length=20, choices=ENVIRONMENT_CHOICES, default=ENV_DEVELOPMENT)
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
		constraints = [
			models.UniqueConstraint(fields=["environment"], name="communications_unique_mailgun_settings_environment"),
		]

	def __str__(self) -> str:
		return f"MailgunSettings env={self.environment} backend={self.kampus_email_backend}"


class WhatsAppSettings(models.Model):
	ENV_DEVELOPMENT = "development"
	ENV_PRODUCTION = "production"

	ENVIRONMENT_CHOICES = [
		(ENV_DEVELOPMENT, "Development"),
		(ENV_PRODUCTION, "Production"),
	]

	SEND_MODE_TEMPLATE = "template"
	SEND_MODE_TEXT = "text"

	SEND_MODE_CHOICES = [
		(SEND_MODE_TEMPLATE, "Template"),
		(SEND_MODE_TEXT, "Text"),
	]

	environment = models.CharField(max_length=20, choices=ENVIRONMENT_CHOICES, default=ENV_DEVELOPMENT)
	enabled = models.BooleanField(default=False)
	provider = models.CharField(max_length=50, default="meta_cloud_api")
	graph_base_url = models.URLField(default="https://graph.facebook.com")
	api_version = models.CharField(max_length=20, default="v21.0")
	phone_number_id = models.CharField(max_length=120, blank=True, default="")
	access_token = models.CharField(max_length=255, blank=True, default="")
	app_secret = models.CharField(max_length=255, blank=True, default="")
	webhook_verify_token = models.CharField(max_length=255, blank=True, default="")
	webhook_strict = models.BooleanField(default=True)
	http_timeout_seconds = models.PositiveSmallIntegerField(default=12)
	send_mode = models.CharField(max_length=20, choices=SEND_MODE_CHOICES, default=SEND_MODE_TEMPLATE)
	template_fallback_name = models.CharField(max_length=120, blank=True, default="")
	updated_by = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="whatsapp_settings_updates",
		blank=True,
		null=True,
	)
	updated_at = models.DateTimeField(auto_now=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-updated_at"]
		constraints = [
			models.UniqueConstraint(fields=["environment"], name="communications_unique_whatsapp_settings_environment"),
		]

	def __str__(self) -> str:
		return f"WhatsAppSettings env={self.environment} enabled={self.enabled}"


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


class EmailTemplate(models.Model):
	TYPE_TRANSACTIONAL = "transactional"
	TYPE_MARKETING = "marketing"

	TYPE_CHOICES = [
		(TYPE_TRANSACTIONAL, "Transactional"),
		(TYPE_MARKETING, "Marketing"),
	]

	slug = models.SlugField(max_length=80, unique=True)
	name = models.CharField(max_length=120)
	description = models.CharField(max_length=255, blank=True, default="")
	template_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_TRANSACTIONAL)
	category = models.CharField(max_length=50, default="transactional")
	subject_template = models.CharField(max_length=255)
	body_text_template = models.TextField(blank=True, default="")
	body_html_template = models.TextField(blank=True, default="")
	allowed_variables = models.JSONField(default=list, blank=True)
	is_active = models.BooleanField(default=True)
	updated_by = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="email_templates_updates",
		blank=True,
		null=True,
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["slug"]

	def __str__(self) -> str:
		return f"{self.slug} ({self.template_type})"


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


class WhatsAppContact(models.Model):
	user = models.OneToOneField(
		"users.User",
		on_delete=models.CASCADE,
		related_name="whatsapp_contact",
	)
	phone_number = models.CharField(max_length=32, unique=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at"]

	def __str__(self) -> str:
		return f"user={self.user_id} phone={self.phone_number}"


class WhatsAppDelivery(models.Model):
	STATUS_PENDING = "PENDING"
	STATUS_SENT = "SENT"
	STATUS_DELIVERED = "DELIVERED"
	STATUS_READ = "READ"
	STATUS_FAILED = "FAILED"
	STATUS_SUPPRESSED = "SUPPRESSED"

	STATUS_CHOICES = [
		(STATUS_PENDING, "Pending"),
		(STATUS_SENT, "Sent"),
		(STATUS_DELIVERED, "Delivered"),
		(STATUS_READ, "Read"),
		(STATUS_FAILED, "Failed"),
		(STATUS_SUPPRESSED, "Suppressed"),
	]

	institution = models.ForeignKey(
		"core.Institution",
		on_delete=models.SET_NULL,
		related_name="whatsapp_deliveries",
		blank=True,
		null=True,
	)
	recipient_phone = models.CharField(max_length=32)
	message_text = models.TextField(blank=True, default="")
	category = models.CharField(max_length=50, default="transactional")
	provider = models.CharField(max_length=50, default="meta_cloud_api")
	provider_message_id = models.CharField(max_length=255, blank=True, default="")
	idempotency_key = models.CharField(max_length=150, blank=True, default="", db_index=True)
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
	error_code = models.CharField(max_length=30, blank=True, default="")
	error_message = models.TextField(blank=True, default="")
	metadata = models.JSONField(default=dict, blank=True)
	sent_at = models.DateTimeField(blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]
		constraints = [
			models.UniqueConstraint(
				fields=["recipient_phone", "idempotency_key"],
				condition=~models.Q(idempotency_key=""),
				name="communications_unique_whatsapp_idempotency",
			)
		]

	def __str__(self) -> str:
		return f"{self.recipient_phone} ({self.status})"


class WhatsAppSuppression(models.Model):
	REASON_OPTED_OUT = "OPTED_OUT"
	REASON_INVALID_NUMBER = "INVALID_NUMBER"
	REASON_NOT_WHATSAPP = "NOT_WHATSAPP"
	REASON_POLICY_BLOCK = "POLICY_BLOCK"

	REASON_CHOICES = [
		(REASON_OPTED_OUT, "Opted out"),
		(REASON_INVALID_NUMBER, "Invalid number"),
		(REASON_NOT_WHATSAPP, "Not a WhatsApp number"),
		(REASON_POLICY_BLOCK, "Policy blocked"),
	]

	phone_number = models.CharField(max_length=32, unique=True)
	reason = models.CharField(max_length=30, choices=REASON_CHOICES)
	provider = models.CharField(max_length=50, default="meta_cloud_api")
	source_event_id = models.CharField(max_length=255, blank=True, default="")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self) -> str:
		return f"{self.phone_number} ({self.reason})"


class WhatsAppEvent(models.Model):
	provider = models.CharField(max_length=50, default="meta_cloud_api")
	provider_event_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
	event_type = models.CharField(max_length=50)
	recipient_phone = models.CharField(max_length=32, blank=True, default="")
	provider_message_id = models.CharField(max_length=255, blank=True, default="")
	payload = models.JSONField(default=dict, blank=True)
	processed_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-processed_at"]
		constraints = [
			models.UniqueConstraint(
				fields=["provider", "provider_event_id"],
				condition=~models.Q(provider_event_id=""),
				name="communications_unique_whatsapp_provider_event_id",
			)
		]

	def __str__(self) -> str:
		return f"{self.provider}:{self.event_type}:{self.provider_event_id or self.id}"


class WhatsAppTemplateMap(models.Model):
	CATEGORY_UTILITY = "utility"
	CATEGORY_AUTHENTICATION = "authentication"
	CATEGORY_MARKETING = "marketing"

	CATEGORY_CHOICES = [
		(CATEGORY_UTILITY, "Utility"),
		(CATEGORY_AUTHENTICATION, "Authentication"),
		(CATEGORY_MARKETING, "Marketing"),
	]

	notification_type = models.CharField(max_length=80, unique=True)
	template_name = models.CharField(max_length=120)
	language_code = models.CharField(max_length=20, default="es_CO")
	body_parameter_names = models.JSONField(default=list, blank=True)
	default_components = models.JSONField(default=list, blank=True)
	category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_UTILITY)
	is_active = models.BooleanField(default=True)
	updated_by = models.ForeignKey(
		"users.User",
		on_delete=models.SET_NULL,
		related_name="whatsapp_template_maps_updates",
		blank=True,
		null=True,
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["notification_type"]

	def __str__(self) -> str:
		return f"{self.notification_type} -> {self.template_name} ({self.language_code})"


class WhatsAppInstitutionMetric(models.Model):
	institution = models.ForeignKey(
		"core.Institution",
		on_delete=models.CASCADE,
		related_name="whatsapp_metrics",
	)
	window_start = models.DateTimeField()
	window_end = models.DateTimeField()
	total = models.PositiveIntegerField(default=0)
	sent = models.PositiveIntegerField(default=0)
	delivered = models.PositiveIntegerField(default=0)
	read = models.PositiveIntegerField(default=0)
	failed = models.PositiveIntegerField(default=0)
	suppressed = models.PositiveIntegerField(default=0)
	success_rate = models.FloatField(default=0.0)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-window_end", "institution_id"]
		constraints = [
			models.UniqueConstraint(
				fields=["institution", "window_start", "window_end"],
				name="communications_unique_whatsapp_institution_metric_window",
			),
		]

	def __str__(self) -> str:
		return f"institution={self.institution_id} {self.window_start}->{self.window_end} success={self.success_rate:.2f}%"
