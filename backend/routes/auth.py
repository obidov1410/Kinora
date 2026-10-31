"""Telegram authentication, profile, favorites and subscription endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import (
    TelegramAuthError,
    get_current_user,
    upsert_user,
    validate_telegram_init_data,
)
from ..config import settings
from ..database import get_db
from ..models import Content, Favorite, User, VipPlan
from ..schemas import (
    DevLoginIn,
    LanguageIn,
    LoginOut,
    TelegramLoginIn,
)
from ..serializers import is_vip, serialize_content, serialize_plan, serialize_user
from ..services import get_setting
from ..utils import iso_utc

router = APIRouter(tags=["auth"])


@router.post("/auth/telegram", response_model=LoginOut)
def telegram_login(payload: TelegramLoginIn, db: Session = Depends(get_db)):
    if not settings.telegram_configured:
        raise HTTPException(
            status_code=503,
            detail="Serverda BOT_TOKEN sozlanmagan. Telegram kirish vaqtincha ishlamaydi.",
        )
    try:
        tg_user = validate_telegram_init_data(payload.init_data)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None

    telegram_id = int(tg_user["id"])
    existing = db.scalar(select(User).where(User.telegram_id == telegram_id))
    if existing and existing.is_blocked:
        raise HTTPException(status_code=403, detail="Hisobingiz bloklangan")

    user = upsert_user(
        db,
        telegram_id=telegram_id,
        username=tg_user.get("username"),
        first_name=tg_user.get("first_name"),
        last_name=tg_user.get("last_name"),
        photo_url=tg_user.get("photo_url"),
        language_code=tg_user.get("language_code"),
        requested_language=payload.language,
    )
    from ..auth import create_session_token

    return {"token": create_session_token(user), "user": serialize_user(user)}


@router.post("/auth/dev", response_model=LoginOut)
def dev_login(payload: DevLoginIn, db: Session = Depends(get_db)):
    if not settings.dev_login_allowed:
        raise HTTPException(status_code=404, detail="Topilmadi")
    user = upsert_user(
        db,
        telegram_id=payload.telegram_id,
        username=payload.username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        requested_language=payload.language,
    )
    from ..auth import create_session_token

    return {"token": create_session_token(user), "user": serialize_user(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favorites_count = db.scalar(select(func.count(Favorite.id)).where(Favorite.user_id == user.id)) or 0
    data = serialize_user(user)
    data["favorites_count"] = favorites_count
    return data


@router.patch("/me/language")
def update_language(
    payload: LanguageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.language = payload.language
    db.commit()
    return {"language": user.language}


@router.get("/me/favorites")
def my_favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    favorites = (
        db.execute(
            select(Favorite)
            .where(Favorite.user_id == user.id)
            .options(selectinload(Favorite.content))
            .order_by(Favorite.created_at.desc())
        )
        .scalars()
        .all()
    )
    items = []
    for favorite in favorites:
        if favorite.content and favorite.content.is_published:
            item = serialize_content(favorite.content)
            item["favorited_at"] = favorite.created_at.isoformat() if favorite.created_at else None
            items.append(item)
    return items


@router.get("/me/favorites/ids")
def favorite_ids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = db.execute(select(Favorite.content_id).where(Favorite.user_id == user.id)).scalars().all()
    return {"ids": list(ids)}


@router.post("/me/favorites/{content_id}")
def add_favorite(
    content_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = db.get(Content, content_id)
    if not content or not content.is_published:
        raise HTTPException(status_code=404, detail="Kontent topilmadi")
    existing = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.content_id == content.id)
    )
    if not existing:
        db.add(Favorite(user_id=user.id, content_id=content.id))
        db.commit()
    return {"favorited": True}


@router.delete("/me/favorites/{content_id}")
def remove_favorite(
    content_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    favorite = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.content_id == content_id)
    )
    if favorite:
        db.delete(favorite)
        db.commit()
    return {"favorited": False}


@router.get("/me/subscription")
def subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enabled = bool(get_setting(db, "vip_enabled", False))
    plans = []
    if enabled:
        plans = (
            db.execute(
                select(VipPlan).where(VipPlan.is_active.is_(True)).order_by(VipPlan.sort_order, VipPlan.days)
            )
            .scalars()
            .all()
        )
    return {
        "vip_enabled": enabled,
        "is_vip": is_vip(user),
        "vip_until": iso_utc(user.vip_until),
        "plans": [serialize_plan(plan) for plan in plans],
        "payment_configured": settings.payment_provider not in {"", "none"},
    }
