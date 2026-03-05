from __future__ import annotations

import base64
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings


PDF_BASE_CSS = """
@page {
    size: A4;
    margin: 18mm 12mm;
    @bottom-right {
        content: "Página " counter(page) " de " counter(pages);
        font-size: 9pt;
        color: #64748b;
    }
}

html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 11pt;
    color: #0f172a;
}

h1, h2, h3 { margin: 0 0 8px 0; }
p { margin: 0 0 6px 0; }

table { width: 100%; border-collapse: collapse; }
th, td { padding: 6px 8px; border: 1px solid #e2e8f0; }
th { background: #f8fafc; }
"""


class WeasyPrintUnavailableError(RuntimeError):
    pass


# 1x1 transparent PNG used as a safe placeholder when local image assets are missing.
_TRANSPARENT_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7nL5sAAAAASUVORK5CYII="
)


def _missing_local_resource_response(path: Path):
    mime_type, _ = mimetypes.guess_type(str(path))
    if (mime_type or "").startswith("image/"):
        return {
            "string": _TRANSPARENT_PNG_BYTES,
            "mime_type": "image/png",
            "encoding": None,
            "redirected_url": path.resolve().as_uri(),
        }

    return {
        "string": b"",
        "mime_type": mime_type or "application/octet-stream",
        "encoding": None,
        "redirected_url": path.resolve().as_uri(),
    }


def weasyprint_url_fetcher(url: str):
    """Map /media and /static URLs to local files.

    Blocks remote http(s) URLs to reduce SSRF risk.
    """

    parsed = urlparse(url)
    path = parsed.path or ""

    media_url = (getattr(settings, "MEDIA_URL", "") or "").rstrip("/") + "/"
    static_url = (getattr(settings, "STATIC_URL", "") or "").rstrip("/") + "/"

    # Allow absolute URLs only when they resolve to local MEDIA/STATIC paths.
    if media_url and path.startswith(media_url):
        rel = path[len(media_url) :].lstrip("/")
        file_path = Path(settings.MEDIA_ROOT) / rel
    elif static_url and path.startswith(static_url):
        static_root = getattr(settings, "STATIC_ROOT", None)
        if not static_root:
            from weasyprint.urls import default_url_fetcher  # noqa: PLC0415

            return default_url_fetcher(url)
        rel = path[len(static_url) :].lstrip("/")
        file_path = Path(static_root) / rel
    else:
        if parsed.scheme in {"http", "https"}:
            raise ValueError("Remote URLs are not allowed in PDF rendering")

        from weasyprint.urls import default_url_fetcher  # noqa: PLC0415

        return default_url_fetcher(url)

    if not file_path.exists():
        return _missing_local_resource_response(file_path)

    mime_type, _ = mimetypes.guess_type(str(file_path))
    return {
        # Use local filename + file:// URL so WeasyPrint never tries to re-open
        # the original '/media/...' URL path as a filesystem path.
        "filename": str(file_path.resolve()),
        "mime_type": mime_type or "application/octet-stream",
        "encoding": None,
        "redirected_url": file_path.resolve().as_uri(),
    }


def _rewrite_local_media_urls(content: str) -> str:
    if not content:
        return content

    media_url = (getattr(settings, "MEDIA_URL", "") or "").rstrip("/") + "/"
    if not media_url:
        return content

    media_path_prefix = media_url

    def _resolve_media_target(rel: str) -> str:
        rel_clean = str(rel or "").lstrip("/")
        file_path = Path(settings.MEDIA_ROOT) / rel_clean
        if file_path.exists():
            return file_path.resolve().as_uri()

        mime_type, _ = mimetypes.guess_type(rel_clean)
        if (mime_type or "").startswith("image/"):
            return "data:image/png;base64," + base64.b64encode(_TRANSPARENT_PNG_BYTES).decode("ascii")
        return "about:blank"

    # Replace quoted URLs in HTML attributes.
    quoted_pattern = re.compile(r"(?P<q>['\"])" + re.escape(media_path_prefix) + r"(?P<rel>[^'\"]+)(?P=q)")

    def _quoted_repl(match: re.Match[str]) -> str:
        q = match.group("q")
        rel = match.group("rel")
        return f"{q}{_resolve_media_target(rel)}{q}"

    content = quoted_pattern.sub(_quoted_repl, content)

    # Replace CSS url(/media/...) patterns.
    css_url_pattern = re.compile(
        r"url\((?P<q>['\"]?)" + re.escape(media_path_prefix) + r"(?P<rel>[^)'\"]+)(?P=q)\)",
        flags=re.IGNORECASE,
    )

    def _css_repl(match: re.Match[str]) -> str:
        q = match.group("q") or ""
        rel = match.group("rel")
        return f"url({q}{_resolve_media_target(rel)}{q})"

    return css_url_pattern.sub(_css_repl, content)


def render_pdf_bytes_from_html(*, html: str, base_url: str | None = None, extra_css: str = "") -> bytes:
    """Render PDF bytes using WeasyPrint with safe URL fetching."""

    try:
        from weasyprint import CSS, HTML  # noqa: PLC0415
    except (ImportError, OSError) as e:  # pragma: no cover
        raise WeasyPrintUnavailableError(
            "WeasyPrint no está disponible en este entorno (faltan dependencias del sistema, p. ej. GTK/Pango). "
            "En Windows, lo más estable es usar `docker-compose up --build` para generar PDFs, "
            "o instalar las dependencias de WeasyPrint siguiendo: "
            "https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#installation"
        ) from e

    html = _rewrite_local_media_urls(html)
    stylesheets = [CSS(string=_rewrite_local_media_urls(PDF_BASE_CSS))]
    if extra_css:
        stylesheets.append(CSS(string=_rewrite_local_media_urls(extra_css)))

    return HTML(
        string=html,
        base_url=base_url,
        url_fetcher=weasyprint_url_fetcher,
    ).write_pdf(stylesheets=stylesheets)
