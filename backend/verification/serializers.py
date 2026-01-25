from __future__ import annotations

from rest_framework import serializers

from .models import VerifiableDocument
from .payload_policy import sanitize_public_payload


class PublicVerifiableDocumentSerializer(serializers.ModelSerializer):
    version = serializers.IntegerField(default=1)
    valid = serializers.SerializerMethodField()
    doc_type_label = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    public_payload = serializers.SerializerMethodField()

    class Meta:
        model = VerifiableDocument
        fields = [
            "version",
            "valid",
            "token",
            "doc_type",
            "doc_type_label",
            "status",
            "status_label",
            "issued_at",
            "expires_at",
            "revoked_at",
            "revoked_reason",
            "seal_hash",
            "title",
            "public_payload",
        ]

    def get_valid(self, obj: VerifiableDocument) -> bool:
        return obj.is_valid()

    def get_doc_type_label(self, obj: VerifiableDocument) -> str:
        try:
            return dict(VerifiableDocument.DocType.choices).get(obj.doc_type, obj.doc_type)
        except Exception:
            return obj.doc_type

    def get_status_label(self, obj: VerifiableDocument) -> str:
        try:
            return dict(VerifiableDocument.Status.choices).get(obj.status, obj.status)
        except Exception:
            return obj.status

    def get_title(self, obj: VerifiableDocument) -> str:
        payload = sanitize_public_payload(obj.doc_type, obj.public_payload)
        title = payload.get("title")
        return title if isinstance(title, str) else ""

    def get_public_payload(self, obj: VerifiableDocument) -> dict:
        return sanitize_public_payload(obj.doc_type, obj.public_payload)
