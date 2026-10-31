"""Authenticated image uploads (posters, backdrops, ad banners)."""
from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from ..auth import require_admin
from ..config import settings
from ..models import User

router = APIRouter(tags=["uploads"])

ALLOWED_KINDS = {"poster", "backdrop", "ad"}
MAX_DIMENSION = 2000


@router.post("/admin/upload")
async def upload_image(
    file: UploadFile = File(...),
    kind: str = Form(default="poster"),
    admin: User = Depends(require_admin),
):
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="Rasm turi noto'g'ri")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Faqat JPEG, PNG yoki WebP rasm yuklash mumkin")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    payload = await file.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Rasm hajmi {settings.max_upload_mb} MB dan oshmasligi kerak")
    if not payload:
        raise HTTPException(status_code=400, detail="Bo'sh fayl yuborildi")

    try:
        with Image.open(io.BytesIO(payload)) as image:
            image.verify()
        with Image.open(io.BytesIO(payload)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="WEBP", quality=88, method=4)
            output = buffer.getvalue()
            width, height = image.size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Fayl haqiqiy rasm emas") from None

    target_dir = settings.uploads_path / kind
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.webp"
    (target_dir / filename).write_bytes(output)
    return {
        "url": f"/uploads/{kind}/{filename}",
        "width": width,
        "height": height,
        "bytes": len(output),
    }
