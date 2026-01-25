from __future__ import annotations

from urllib.parse import urljoin
from typing import Any

from django.conf import settings
from django.urls import reverse

from .models import VerifiableDocument
from .payload_policy import sanitize_public_payload


def get_or_create_for_certificate_issue(
    *,
    issue_uuid: str,
    public_payload: dict[str, Any],
    seal_hash: str = "",
) -> VerifiableDocument:
    public_payload = sanitize_public_payload(VerifiableDocument.DocType.STUDY_CERTIFICATE, public_payload)

    existing = VerifiableDocument.objects.filter(
        doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
        object_type="CertificateIssue",
        object_id=str(issue_uuid),
    ).first()
    if existing:
        if public_payload and (existing.public_payload or {}) != public_payload:
            existing.public_payload = public_payload
            if seal_hash is not None:
                existing.seal_hash = seal_hash or existing.seal_hash
            existing.save(update_fields=["public_payload", "seal_hash", "updated_at"])
        return existing

    return VerifiableDocument.create_with_unique_token(
        doc_type=VerifiableDocument.DocType.STUDY_CERTIFICATE,
        public_payload=public_payload,
        seal_hash=seal_hash or "",
        object_type="CertificateIssue",
        object_id=str(issue_uuid),
    )


def build_public_absolute_url(path: str) -> str:
    """Builds a public absolute URL using PUBLIC_SITE_URL when available.

    This is safe for Celery tasks where no request object exists.
    If PUBLIC_SITE_URL is not configured, returns the path as-is.
    """

    base = str(getattr(settings, "PUBLIC_SITE_URL", "") or "").strip()
    if not base:
        return path
    return urljoin(base.rstrip("/") + "/", path.lstrip("/"))


def build_public_verify_url(token: str) -> str:
    return build_public_absolute_url(reverse("public-verify", kwargs={"token": token}))


def get_or_create_for_report_job(
    *,
    job_id: int,
    doc_type: str,
    public_payload: dict[str, Any],
    seal_hash: str = "",
) -> VerifiableDocument:
    public_payload = sanitize_public_payload(doc_type, public_payload)

    existing = VerifiableDocument.objects.filter(
        doc_type=doc_type,
        object_type="ReportJob",
        object_id=str(job_id),
    ).first()
    if existing:
        # Keep the first issued token stable, but allow backfilling/refreshing payload.
        if public_payload and (existing.public_payload or {}) != public_payload:
            existing.public_payload = public_payload
            if seal_hash is not None:
                existing.seal_hash = seal_hash or existing.seal_hash
            existing.save(update_fields=["public_payload", "seal_hash", "updated_at"])
        return existing

    return VerifiableDocument.create_with_unique_token(
        doc_type=doc_type,
        public_payload=public_payload,
        seal_hash=seal_hash or "",
        object_type="ReportJob",
        object_id=str(job_id),
    )
