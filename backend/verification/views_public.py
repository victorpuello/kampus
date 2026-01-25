from __future__ import annotations

from django.shortcuts import render
from django.views import View
from django.db.utils import OperationalError, ProgrammingError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import VerifiableDocument
from .payload_policy import sanitize_public_payload
from .serializers import PublicVerifiableDocumentSerializer
from .throttles import PublicVerifyRateThrottle


def _get_client_ip(request) -> str:
    # Best-effort extraction behind reverse proxies.
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return str(request.META.get("REMOTE_ADDR") or "").strip()


def _update_status_if_needed(doc: VerifiableDocument) -> VerifiableDocument:
    new_status = doc.recompute_status()
    if new_status != doc.status:
        doc.status = new_status
        doc.save(update_fields=["status", "updated_at"])
    return doc


def _try_log_verification_event(*, request, token: str, doc: VerifiableDocument | None) -> None:
    try:
        from .models import VerificationEvent  # noqa: PLC0415

        if doc is None:
            outcome = VerificationEvent.Outcome.NOT_FOUND
            doc_type = ""
            status = ""
        else:
            doc_type = doc.doc_type
            status = doc.status
            if doc.is_valid():
                outcome = VerificationEvent.Outcome.VALID
            elif doc.status == VerifiableDocument.Status.REVOKED:
                outcome = VerificationEvent.Outcome.REVOKED
            elif doc.status == VerifiableDocument.Status.EXPIRED:
                outcome = VerificationEvent.Outcome.EXPIRED
            else:
                outcome = VerificationEvent.Outcome.INVALID

        accept = str(request.META.get("HTTP_ACCEPT") or "")[:128]
        ua = str(request.META.get("HTTP_USER_AGENT") or "")[:255]

        VerificationEvent.objects.create(
            token_hash=VerificationEvent.hash_token(token),
            token_prefix=token[:12],
            doc_type=doc_type,
            status=status,
            outcome=outcome,
            ip_address=_get_client_ip(request),
            user_agent=ua,
            path=str(getattr(request, "path", "") or "")[:255],
            accept=accept,
        )
    except (OperationalError, ProgrammingError):
        # DB not migrated yet (deploy) — do not break verification.
        return
    except Exception:
        return


class PublicVerifyAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicVerifyRateThrottle]

    def get(self, request, token: str, format=None):
        token_clean = str(token or "").strip()
        if token_clean and token_clean != token:
            # Some QR scanners append newlines/spaces. Redirect to canonical URL.
            from django.http import HttpResponsePermanentRedirect  # noqa: PLC0415
            from django.urls import reverse  # noqa: PLC0415

            location = reverse("public-verify", kwargs={"token": token_clean})
            return HttpResponsePermanentRedirect(location)

        token = token_clean or token
        accept = (request.META.get("HTTP_ACCEPT") or "").lower()
        if "text/html" in accept:
            # Update status + audit once here, then render HTML.
            doc = VerifiableDocument.objects.filter(token=token).first()
            if doc:
                doc = _update_status_if_needed(doc)
            _try_log_verification_event(request=request, token=token, doc=doc)

            django_request = getattr(request, "_request", request)
            return PublicVerifyUIView().get(django_request, token)

        doc = VerifiableDocument.objects.filter(token=token).first()
        if not doc:
            _try_log_verification_event(request=request, token=token, doc=None)
            return Response({"valid": False, "detail": "Document not found"}, status=404)

        doc = _update_status_if_needed(doc)
        _try_log_verification_event(request=request, token=token, doc=doc)

        return Response(PublicVerifiableDocumentSerializer(doc).data)


class PublicVerifyUIView(View):
    def get(self, request, token: str):
        token_clean = str(token or "").strip()
        if token_clean and token_clean != token:
            from django.http import HttpResponsePermanentRedirect  # noqa: PLC0415
            from django.urls import reverse  # noqa: PLC0415

            location = reverse("public-site-verify-ui", kwargs={"token": token_clean})
            return HttpResponsePermanentRedirect(location)

        token = token_clean or token
        doc = VerifiableDocument.objects.filter(token=token).first()
        if not doc:
            return render(
                request,
                "verification/public/verify.html",
                {"found": False, "token": token},
                status=404,
            )

        doc = _update_status_if_needed(doc)

        payload = sanitize_public_payload(doc.doc_type, doc.public_payload)

        try:
            doc_type_label = dict(VerifiableDocument.DocType.choices).get(doc.doc_type, doc.doc_type)
        except Exception:
            doc_type_label = doc.doc_type
        try:
            status_label = dict(VerifiableDocument.Status.choices).get(doc.status, doc.status)
        except Exception:
            status_label = doc.status

        return render(
            request,
            "verification/public/verify.html",
            {
                "found": True,
                "token": doc.token,
                "doc_type": doc.doc_type,
                "doc_type_label": doc_type_label,
                "valid": doc.is_valid(),
                "status": doc.status,
                "status_label": status_label,
                "issued_at": doc.issued_at,
                "expires_at": doc.expires_at,
                "revoked_at": doc.revoked_at,
                "revoked_reason": doc.revoked_reason,
                "seal_hash": doc.seal_hash,
                "payload": payload,
            },
        )
