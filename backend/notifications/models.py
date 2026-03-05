from django.conf import settings
from django.db import models


class Notification(models.Model):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )

    # Optional: used to avoid spamming repeated notifications.
    # Example: "EDIT_REQUEST_PENDING:teacher=12:scope=GRADES:period=3"
    dedupe_key = models.CharField(max_length=150, blank=True, default="")

    type = models.CharField(max_length=50, blank=True, default="")
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True, default="")
    url = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "read_at", "created_at"]),
            models.Index(fields=["recipient", "dedupe_key", "created_at"]),
        ]

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.title}"


class NotificationType(models.Model):
    code = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=255, blank=True, default="")
    email_enabled = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=True)
    whatsapp_requires_template = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class NotificationDispatch(models.Model):
    CHANNEL_EMAIL = "EMAIL"
    CHANNEL_WHATSAPP = "WHATSAPP"

    CHANNEL_CHOICES = [
        (CHANNEL_EMAIL, "Email"),
        (CHANNEL_WHATSAPP, "WhatsApp"),
    ]

    STATUS_PENDING = "PENDING"
    STATUS_IN_PROGRESS = "IN_PROGRESS"
    STATUS_SUCCEEDED = "SUCCEEDED"
    STATUS_FAILED = "FAILED"
    STATUS_DEAD_LETTER = "DEAD_LETTER"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_IN_PROGRESS, "In progress"),
        (STATUS_SUCCEEDED, "Succeeded"),
        (STATUS_FAILED, "Failed"),
        (STATUS_DEAD_LETTER, "Dead letter"),
    ]

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name="dispatches",
    )
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    idempotency_key = models.CharField(max_length=150, blank=True, default="", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    attempts = models.PositiveIntegerField(default=0)
    next_retry_at = models.DateTimeField(blank=True, null=True)
    payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    processed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["channel", "idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="notifications_unique_dispatch_channel_idempotency",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "next_retry_at", "created_at"]),
            models.Index(fields=["notification", "channel", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"dispatch={self.id} notif={self.notification_id} {self.channel} {self.status}"
