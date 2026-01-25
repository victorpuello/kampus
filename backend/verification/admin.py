from django.contrib import admin

from .models import VerifiableDocument, VerificationEvent


@admin.register(VerifiableDocument)
class VerifiableDocumentAdmin(admin.ModelAdmin):
    list_display = ("doc_type", "status", "issued_at", "expires_at", "revoked_at", "object_type", "object_id")
    search_fields = ("token", "object_type", "object_id", "seal_hash")
    list_filter = ("doc_type", "status")
    ordering = ("-issued_at",)


@admin.register(VerificationEvent)
class VerificationEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "outcome", "doc_type", "status", "ip_address", "token_prefix")
    search_fields = ("token_hash", "token_prefix", "ip_address", "path", "user_agent")
    list_filter = ("outcome", "doc_type", "status")
    ordering = ("-created_at",)
