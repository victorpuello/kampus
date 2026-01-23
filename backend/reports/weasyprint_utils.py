from __future__ import annotations

import mimetypes
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
        from weasyprint.urls import default_url_fetcher  # noqa: PLC0415

        return default_url_fetcher(url)

    mime_type, _ = mimetypes.guess_type(str(file_path))
    return {
        "file_obj": open(file_path, "rb"),
        "mime_type": mime_type or "application/octet-stream",
        "encoding": None,
        "redirected_url": url,
    }


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

    stylesheets = [CSS(string=PDF_BASE_CSS)]
    if extra_css:
        stylesheets.append(CSS(string=extra_css))

    return HTML(
        string=html,
        base_url=base_url,
        url_fetcher=weasyprint_url_fetcher,
    ).write_pdf(stylesheets=stylesheets)
