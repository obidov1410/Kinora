"""Telegram initData validation, session tokens and authorization dependencies."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User
from .utils import now_utc

SESSION_TYPE = "kinora-session"
MEDIA_TYPE = "kinora-media"


class TelegramAuthError(ValueError):
    pass


def validate_telegram_init_data(
    init_data: str,
    bot_token: str | None = None,
    max_age_seconds: int | None = None,
    now_ts: int | None = None,
) -> dict:
    """Validate Telegram Mini App initData HMAC and freshness.

    Returns the parsed user payload. Raises TelegramAuthError on any problem.
    The client-supplied user id is only trusted after the signature check.
    """
    token = bot_token if bot_token is not None else settings.bot_token
    if not token or ":" not in token:
        raise TelegramAuthError("Telegram bot token is not configured on the server")
    if not init_data or len(init_data) > 8192:
        raise TelegramAuthError("initData is missing or too large")

    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=False)
    if not pairs:
        raise TelegramAuthError("Malformed initData")
    data = dict(pairs)

    received_hash = data.pop("hash", None)
    if not received_hash:
        raise TelegramAuthError("Signed hash is missing")

    data_check_string = "\n".join(f"{key}={data[key]}" for key in sorted(data))
    secret_key = hmac.new(b"WebAppData", token.encode("utf-8"), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        raise TelegramAuthError("Invalid Telegram signature")

    try:
        auth_date = int(data.get("auth_date", "0"))
    except (TypeError, ValueError):
        raise TelegramAuthError("auth_date is invalid") from None

    reference = now_ts if now_ts is not None else int(time.time())
    max_age = max_age_seconds if max_age_seconds is not None else settings.telegram_auth_max_age
    if auth_date <= 0:
        raise TelegramAuthError("auth_date is missing")
    if reference - auth_date > max_age:
        raise TelegramAuthError("initData has expired")
    if auth_date - reference > 300:
        raise TelegramAuthError("initData timestamp is in the future")

    try:
        user_payload = json.loads(data.get("user", "null"))
    except json.JSONDecodeError:
        raise TelegramAuthError("User payload is malformed") from None
    if not isinstance(user_payload, dict) or not user_payload.get("id"):
        raise TelegramAuthError("User payload is missing")
    try:
        user_payload["id"] = int(user_payload["id"])
    except (TypeError, ValueError):
        raise TelegramAuthError("User id is invalid") from None
    return user_payload


def create_session_token(user: User) -> str:
    issued = now_utc()
    payload = {
        "sub": str(user.id),
        "tg": user.telegram_id,
        "typ": SESSION_TYPE,
        "iat": int(issued.replace(tzinfo=timezone.utc).timestamp()),
        "exp": int((issued + timedelta(hours=settings.session_ttl_hours)).replace(tzinfo=timezone.utc).timestamp()),
        "jti": base64.urlsafe_b64encode(hashlib.sha256(f"{user.id}:{time.time_ns()}".encode()).digest())[:24].decode(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_session_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "typ"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessiya yaroqsiz yoki muddati tugagan") from None
    if payload.get("typ") != SESSION_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessiya turi noto'g'ri")
    return payload


def get_current_user(
    credentials: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Avtorizatsiya talab qilinadi")
    payload = decode_session_token(credentials.split(" ", 1)[1].strip())
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessiya yaroqsiz") from None
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Foydalanuvchi topilmadi")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hisobingiz bloklangan")
    return user


def get_optional_user(
    credentials: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    if not credentials.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Avtorizatsiya sarlavhasi noto'g'ri")
    payload = decode_session_token(credentials.split(" ", 1)[1].strip())
    try:
        user = db.get(User, int(payload["sub"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessiya yaroqsiz") from None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Foydalanuvchi topilmadi")
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hisobingiz bloklangan")
    return user


def effective_role(user: User) -> str:
    """Owner id always maps to owner, even if the stored role drifted."""
    if user.telegram_id == settings.owner_id:
        return "owner"
    return user.role if user.role in {"owner", "admin", "user"} else "user"


def require_admin(user: User = Depends(get_current_user)) -> User:
    if effective_role(user) not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin huquqi talab qilinadi")
    return user


def require_owner(user: User = Depends(get_current_user)) -> User:
    if effective_role(user) != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Faqat egasi uchun")
    return user


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def sign_media_token(resource_kind: str, resource_id: int) -> str:
    payload = {
        "k": resource_kind,
        "id": int(resource_id),
        "exp": int(time.time()) + settings.media_token_ttl_hours * 3600,
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64(hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_media_token(token: str, resource_kind: str, resource_id: int) -> bool:
    if not token or "." not in token:
        return False
    body, signature = token.split(".", 1)
    expected = _b64(hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature):
        return False
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return False
    return (
        payload.get("k") == resource_kind
        and int(payload.get("id", 0)) == int(resource_id)
        and int(payload.get("exp", 0)) > int(time.time())
    )


def upsert_user(
    db: Session,
    *,
    telegram_id: int,
    username: str | None,
    first_name: str | None,
    last_name: str | None = None,
    photo_url: str | None = None,
    language_code: str | None = None,
    requested_language: str | None = None,
) -> User:
    user = db.scalar(select(User).where(User.telegram_id == telegram_id))
    is_new = user is None
    if is_new:
        user = User(
            telegram_id=telegram_id,
            language="uz",
            role="owner" if telegram_id == settings.owner_id else "user",
            visit_count=0,
        )
        db.add(user)
    assert user is not None

    if username:
        user.username = username[:64]
    if first_name:
        user.first_name = first_name[:128]
    if last_name:
        user.last_name = last_name[:128]
    if photo_url:
        user.photo_url = photo_url[:512]
    if requested_language in {"uz", "uzc"}:
        user.language = requested_language
    elif is_new and language_code in {"uz", "uzb"}:
        user.language = "uz"

    if telegram_id == settings.owner_id:
        user.role = "owner"
    user.visit_count = (user.visit_count or 0) + 1
    user.last_seen_at = now_utc()
    if is_new:
        user.created_at = now_utc()
    db.commit()
    db.refresh(user)
    return user


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
