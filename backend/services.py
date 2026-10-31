"""Domain services shared by routes."""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_client_ip
from .models import AuditLog, Content, Setting, User
from .utils import hash_ip, now_utc, slugify


DEFAULT_SETTINGS: dict[str, object] = {
    "vip_enabled": False,
    "site_notice": "",
}


def get_setting(db: Session, key: str, default=None):
    row = db.get(Setting, key)
    if not row:
        return DEFAULT_SETTINGS.get(key, default)
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return row.value


def set_setting(db: Session, key: str, value) -> None:
    row = db.get(Setting, key)
    payload = json.dumps(value, ensure_ascii=False)
    if row:
        row.value = payload
        row.updated_at = now_utc()
    else:
        db.add(Setting(key=key, value=payload))


def unique_slug(db: Session, title: str, content_id: int | None = None) -> str:
    base = slugify(title)[:180] or "kontent"
    candidate = base
    counter = 2
    while True:
        existing = db.scalar(select(Content).where(Content.slug == candidate))
        if not existing or (content_id is not None and existing.id == content_id):
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def record_audit(
    db: Session,
    actor: User | None,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | int | None = None,
    details: dict | None = None,
    request: Request | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            actor_telegram_id=actor.telegram_id if actor else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details or {},
            ip_hash=hash_ip(get_client_ip(request)) if request else None,
        )
    )


def grant_vip(user: User, days: int) -> None:
    if days == 0:
        return
    current = now_utc()
    start = user.vip_until if user.vip_until and user.vip_until > current else current
    if days > 0:
        user.vip_until = start + timedelta(days=days)
    else:
        new_until = start + timedelta(days=days)
        user.vip_until = new_until if new_until > current else None
