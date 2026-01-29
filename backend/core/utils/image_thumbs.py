import io
import os
from dataclasses import dataclass

from django.core.files.base import ContentFile


@dataclass(frozen=True)
class WebpThumbSpec:
    max_size: int = 256
    quality: int = 80
    method: int = 6


def make_thumb_name(original_name: str, thumbs_dir: str) -> str:
    base = os.path.basename(original_name or "")
    stem = base.rsplit(".", 1)[0] if "." in base else base
    stem = stem or "image"
    thumbs_dir = (thumbs_dir or "").strip("/")
    return f"{thumbs_dir}/{stem}.webp"


def build_webp_thumb_content(src_file, spec: WebpThumbSpec) -> ContentFile:
    from PIL import Image, ImageOps

    src_file.seek(0)
    img = Image.open(src_file)
    img = ImageOps.exif_transpose(img)

    img.thumbnail((spec.max_size, spec.max_size), Image.LANCZOS)

    if img.mode not in ("RGB", "RGBA"):
        # Preserve alpha when present; otherwise use RGB.
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=spec.quality, method=spec.method)
    return ContentFile(out.getvalue())
