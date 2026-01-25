from __future__ import annotations

import re
from urllib.parse import unquote

from django.http import HttpResponsePermanentRedirect


class NormalizeVerificationPathMiddleware:
    """Redirect malformed verification URLs to their canonical paths.

    Some PDF viewers insert whitespace when copying long URLs. Browsers then
    percent-encode it (e.g. `/api/%20%20public/verify/<token>/`), producing a 404.
    This middleware makes the system resilient by stripping that whitespace.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw_uri = (
            str(request.META.get("RAW_URI") or "")
            or str(request.META.get("REQUEST_URI") or "")
            or request.get_full_path()
        )

        if not raw_uri:
            return self.get_response(request)

        path_part, sep, query = raw_uri.partition("?")
        try:
            decoded_path = unquote(path_part)
        except Exception:
            decoded_path = path_part

        normalized_path = decoded_path

        # Only normalize known public verification routes.
        normalized_path = re.sub(r"^/api/\s+public/", "/api/public/", normalized_path)
        normalized_path = re.sub(r"^/public/\s+verify/", "/public/verify/", normalized_path)

        if normalized_path != decoded_path:
            location = normalized_path + (sep + query if query else "")
            return HttpResponsePermanentRedirect(location)

        return self.get_response(request)
