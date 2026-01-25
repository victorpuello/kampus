from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

from django.utils import timezone

from .models import ManualConvivencia, ManualConvivenciaChunk


def _normalize_text(text: str) -> str:
    # Normalize whitespace but keep paragraph-ish structure.
    cleaned = (text or "").replace("\u00a0", " ")
    cleaned = re.sub(r"[\t\r]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ ]{2,}", " ", cleaned)
    return cleaned.strip()


def extract_text_from_pdf(path: str) -> str:
    try:
        from pypdf import PdfReader
    except Exception as e:  # pragma: no cover
        raise RuntimeError("PDF extraction requires 'pypdf'.") from e

    reader = PdfReader(path)
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            parts.append("")
    return _normalize_text("\n\n".join(parts))


def extract_text_from_plaintext(path: str) -> str:
    p = Path(path)
    data = p.read_bytes()
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            return _normalize_text(data.decode(encoding))
        except UnicodeDecodeError:
            continue
    # Fallback for legacy encodings; better than failing hard.
    return _normalize_text(data.decode("latin-1"))


def build_chunks(text: str, *, chunk_size: int = 1200, overlap: int = 200) -> list[tuple[int, int, str]]:
    """Return chunks as (start_char, end_char, chunk_text)"""

    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be >=0 and < chunk_size")

    t = _normalize_text(text)
    if not t:
        return []

    chunks: list[tuple[int, int, str]] = []
    start = 0
    n = len(t)
    while start < n:
        end = min(n, start + chunk_size)
        chunk = t[start:end].strip()
        if chunk:
            chunks.append((start, end, chunk))
        if end >= n:
            break
        start = end - overlap
    return chunks


def process_manual(manual: ManualConvivencia) -> ManualConvivencia:
    """Extract text and create chunks for a manual. Updates status fields."""

    manual.extraction_status = ManualConvivencia.ExtractionStatus.PENDING
    manual.extraction_error = ""
    manual.save(update_fields=["extraction_status", "extraction_error", "updated_at"])

    # Clear previous chunks if re-processing
    ManualConvivenciaChunk.objects.filter(manual=manual).delete()

    try:
        path = manual.file.path
        lower = (manual.file.name or "").lower()
        if lower.endswith(".pdf"):
            extracted = extract_text_from_pdf(path)
        elif lower.endswith((".md", ".markdown", ".txt")):
            extracted = extract_text_from_plaintext(path)
        else:
            raise RuntimeError("Formato no soportado. Sube PDF o Markdown (.md) o TXT (.txt).")

        manual.extracted_text = extracted
        manual.extracted_at = timezone.now()
        manual.extraction_status = ManualConvivencia.ExtractionStatus.DONE
        manual.extraction_error = ""
        manual.save(
            update_fields=[
                "extracted_text",
                "extracted_at",
                "extraction_status",
                "extraction_error",
                "updated_at",
            ]
        )

        chunks = build_chunks(extracted)
        ManualConvivenciaChunk.objects.bulk_create(
            [
                ManualConvivenciaChunk(
                    manual=manual,
                    index=i,
                    text=chunk_text,
                    start_char=start,
                    end_char=end,
                    label="",
                )
                for i, (start, end, chunk_text) in enumerate(chunks)
            ]
        )
        return manual
    except Exception as e:
        manual.extraction_status = ManualConvivencia.ExtractionStatus.FAILED
        manual.extraction_error = str(e)
        manual.save(update_fields=["extraction_status", "extraction_error", "updated_at"])
        return manual
