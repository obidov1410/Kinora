"""Admin dashboard statistics and audit log."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..config import settings
from ..database import get_db
from ..models import Ad, AdEvent, AuditLog, Content, Transaction, User, ViewEvent
from ..serializers import serialize_user
from ..utils import iso_utc, now_utc, start_of_day

router = APIRouter(tags=["admin-stats"])


def _count(db: Session, entity, *conditions) -> int:
    return db.scalar(select(func.count(entity.id)).where(*conditions)) or 0


@router.get("/admin/stats")
def dashboard_stats(
    days: int = Query(default=14, ge=7, le=90),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    now = now_utc()
    today = start_of_day()
    week = now - timedelta(days=7)
    month = now - timedelta(days=30)

    total_users = _count(db, User)
    vip_subscribers = _count(db, User, User.vip_until > now)
    total_movies = _count(db, Content, Content.kind == "movie")
    total_series = _count(db, Content, Content.kind == "series")
    published = _count(db, Content, Content.is_published.is_(True))
    total_views = db.scalar(select(func.coalesce(func.sum(Content.views_count), 0))) or 0
    impressions = db.scalar(select(func.coalesce(func.sum(Ad.impressions), 0))) or 0
    clicks = db.scalar(select(func.coalesce(func.sum(Ad.clicks), 0))) or 0
    paid_tx = db.execute(
        select(func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.status == "paid")
    ).one()

    popular = (
        db.execute(
            select(Content)
            .where(Content.is_published.is_(True))
            .order_by(Content.views_count.desc(), Content.created_at.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )

    recent_users = (
        db.execute(select(User).order_by(User.last_seen_at.desc()).limit(6)).scalars().all()
    )
    recent_audit = (
        db.execute(
            select(AuditLog, User)
            .outerjoin(User, AuditLog.actor_id == User.id)
            .order_by(AuditLog.created_at.desc())
            .limit(8)
        )
        .all()
    )

    day_labels: list[str] = []
    daily_users: list[int] = []
    daily_views: list[int] = []
    daily_impressions: list[int] = []
    daily_clicks: list[int] = []
    for offset in range(days - 1, -1, -1):
        day_start = start_of_day(offset)
        day_end = day_start + timedelta(days=1)
        day_labels.append(day_start.strftime("%Y-%m-%d"))
        daily_users.append(_count(db, User, User.created_at >= day_start, User.created_at < day_end))
        daily_views.append(_count(db, ViewEvent, ViewEvent.created_at >= day_start, ViewEvent.created_at < day_end))
        daily_impressions.append(
            _count(
                db,
                AdEvent,
                AdEvent.event_type == "impression",
                AdEvent.created_at >= day_start,
                AdEvent.created_at < day_end,
            )
        )
        daily_clicks.append(
            _count(
                db,
                AdEvent,
                AdEvent.event_type == "click",
                AdEvent.created_at >= day_start,
                AdEvent.created_at < day_end,
            )
        )

    monthly_labels: list[str] = []
    monthly_users: list[int] = []
    monthly_views: list[int] = []
    month_anchor = today.replace(day=1)
    starts = []
    for _ in range(12):
        starts.append(month_anchor)
        month_anchor = (month_anchor - timedelta(days=1)).replace(day=1)
    for month_start in reversed(starts):
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1)
        monthly_labels.append(month_start.strftime("%Y-%m"))
        monthly_users.append(_count(db, User, User.created_at >= month_start, User.created_at < month_end))
        monthly_views.append(
            _count(db, ViewEvent, ViewEvent.created_at >= month_start, ViewEvent.created_at < month_end)
        )

    return {
        "cards": {
            "total_users": total_users,
            "new_users_today": _count(db, User, User.created_at >= today),
            "new_users_7d": _count(db, User, User.created_at >= week),
            "new_users_30d": _count(db, User, User.created_at >= month),
            "active_users_today": _count(db, User, User.last_seen_at >= today),
            "active_users_7d": _count(db, User, User.last_seen_at >= week),
            "total_movies": total_movies,
            "total_series": total_series,
            "published_content": published,
            "total_views": int(total_views),
            "ad_impressions": int(impressions),
            "ad_clicks": int(clicks),
            "ad_ctr": round((clicks / impressions) * 100, 2) if impressions else 0.0,
            "vip_subscribers": vip_subscribers,
            "paid_transactions": int(paid_tx[0] or 0),
            "revenue": int(paid_tx[1] or 0),
            "payment_configured": settings.payment_provider not in {"", "none"},
            "telegram_configured": settings.telegram_configured,
        },
        "daily": {
            "labels": day_labels,
            "users": daily_users,
            "views": daily_views,
            "impressions": daily_impressions,
            "clicks": daily_clicks,
        },
        "monthly": {
            "labels": monthly_labels,
            "users": monthly_users,
            "views": monthly_views,
        },
        "popular": [
            {
                "id": item.id,
                "title": item.title,
                "title_cyrl": item.title_cyrl,
                "kind": item.kind,
                "year": item.year,
                "views_count": item.views_count,
                "poster_url": item.poster_url,
            }
            for item in popular
        ],
        "recent_users": [serialize_user(user) for user in recent_users],
        "recent_audit": [
            {
                "id": log.id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "details": log.details,
                "created_at": iso_utc(log.created_at),
                "actor": {
                    "name": actor.first_name if actor else None,
                    "username": actor.username if actor else None,
                    "telegram_id": log.actor_telegram_id,
                },
            }
            for log, actor in recent_audit
        ],
    }


@router.get("/admin/audit")
def audit_log(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    action: str | None = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    total = _count(db, AuditLog, *conditions)
    rows = db.execute(
        select(AuditLog, User)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [
            {
                "id": log.id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "details": log.details,
                "created_at": iso_utc(log.created_at),
                "actor_telegram_id": log.actor_telegram_id,
                "actor_name": (actor.first_name or "") + (" " + actor.last_name if actor and actor.last_name else "")
                if actor
                else None,
                "actor_username": actor.username if actor else None,
            }
            for log, actor in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }
