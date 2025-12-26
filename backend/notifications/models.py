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
