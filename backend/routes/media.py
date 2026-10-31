"""Secure Telegram Bot API media proxying.

Telegram file_id values are not browser-playable. When a video is uploaded
through the bot, the backend resolves a short-lived file path with getFile and
streams the bytes through this endpoint. Telegram Bot API limits bot downloads
to 20 MB, so larger files must use an authorised hosting URL or a storage
provider integration.
"""
from __future__ import annotations

import time
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..auth import verify_media_token
from ..config import settings
from ..database import get_db
from ..models import Content, Episode

router = APIRouter(tags=["media"])

_file_cache: dict[str, tuple[str, float]] = {}


async def _resolve_file_path(file_id: str) -> str:
    cached = _file_cache.get(file_id)
    if cached and cached[1] > time.time():
        return cached[0]
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"https://api.telegram.org/bot{settings.bot_token}/getFile",
            params={"file_id": file_id},
        )
    data = response.json()
    if not response.is_success or not data.get("ok"):
        raise HTTPException(status_code=502, detail="Telegram faylini aniqlab bo'lmadi")
    path = data["result"].get("file_path")
    if not path:
        raise HTTPException(status_code=502, detail="Telegram fayl yo'li qaytmadi")
    _file_cache[file_id] = (path, time.time() + 3000)
    return path


@router.get("/media/stream/{resource_kind}/{resource_id}")
async def stream_telegram_media(
    resource_kind: str,
    resource_id: int,
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    if resource_kind not in {"content", "episode"}:
        raise HTTPException(status_code=404, detail="Media topilmadi")
    if not verify_media_token(token, resource_kind, resource_id):
        raise HTTPException(status_code=403, detail="Media token yaroqsiz yoki muddati tugagan")
    if not settings.telegram_configured:
        raise HTTPException(status_code=503, detail="Telegram media serverda sozlanmagan")

    file_id = None
    if resource_kind == "content":
        content = db.get(Content, resource_id)
        if content and content.video_source == "telegram":
            file_id = content.telegram_file_id
    else:
        episode = db.get(Episode, resource_id)
        if episode and episode.video_source == "telegram":
            file_id = episode.telegram_file_id
    if not file_id:
        raise HTTPException(status_code=404, detail="Video biriktirilmagan")

    file_path = await _resolve_file_path(file_id)
    upstream_url = f"https://api.telegram.org/file/bot{settings.bot_token}/{quote(file_path)}"
    headers = {}
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(timeout=httpx.Timeout(connect=15, read=None, write=None, pool=15), follow_redirects=True)
    upstream = await client.send(client.build_request("GET", upstream_url, headers=headers), stream=True)
    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        return JSONResponse(status_code=502, content={"detail": "Telegram videosini oqim qilib bo'lmadi"})

    passthrough = {}
    for header in ("content-length", "content-range", "accept-ranges", "content-type", "last-modified", "etag"):
        if header in upstream.headers:
            passthrough[header] = upstream.headers[header]
    passthrough["Cache-Control"] = "private, max-age=0, no-store"
    passthrough["Accept-Ranges"] = passthrough.get("Accept-Ranges", "bytes")

    async def body():
        try:
            async for chunk in upstream.aiter_bytes(64 * 1024):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        body(),
        status_code=upstream.status_code,
        headers=passthrough,
        media_type=upstream.headers.get("content-type", "video/mp4"),
    )
