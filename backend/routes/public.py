"""Public catalog, home aggregates and runtime configuration."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import get_client_ip, get_optional_user
from ..constants import GENRES, PLACEMENTS
from ..database import get_db
from ..models import Content, Season, ViewEvent
from ..serializers import serialize_content
from ..services import get_setting
from ..utils import hash_ip, now_utc

router = APIRouter(tags=["catalog"])

SORT_OPTIONS = {
    "newest": (Content.created_at.desc(), Content.id.desc()),
    "popular": (Content.views_count.desc(), Content.created_at.desc()),
    "year": (Content.year.desc(), Content.created_at.desc()),
    "title": (func.lower(Content.title).asc(),),
}


def _published():
    return Content.is_published.is_(True)


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    from ..config import settings

    payment_configured = settings.payment_provider not in {"", "none"}
    return {
        "app_name": "KINORA",
        "bot_username": settings.bot_username,
        "vip_enabled": bool(get_setting(db, "vip_enabled", False)),
        "site_notice": get_setting(db, "site_notice", ""),
        "payment_configured": payment_configured,
        "payment_provider": settings.payment_provider if payment_configured else None,
        "dev_login_allowed": settings.dev_login_allowed,
        "telegram_configured": settings.telegram_configured,
        "languages": ["uz", "uzc"],
        "genres": GENRES,
        "placements": PLACEMENTS,
    }


@router.get("/genres")
def list_genres(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Content.genres).where(_published(), Content.genres.is_not(None))
    ).scalars()
    counts: dict[str, int] = {}
    for genres in rows:
        for genre in genres or []:
            counts[genre] = counts.get(genre, 0) + 1
    return [
        {"key": key, "count": counts.get(key, 0)}
        for key in GENRES
        if counts.get(key, 0) > 0
    ]


def _catalog_query(
    db: Session,
    *,
    kind: str | None,
    genre: str | None,
    search: str | None,
    sort: str,
    page: int,
    page_size: int,
    include_unpublished: bool = False,
):
    conditions = []
    if not include_unpublished:
        conditions.append(_published())
    if kind in {"movie", "series"}:
        conditions.append(Content.kind == kind)
    if genre:
        if genre not in GENRES:
            raise HTTPException(status_code=400, detail="Noma'lum janr")
        conditions.append(cast(Content.genres, String).like(f'%"{genre}"%'))
    if search:
        needle = f"%{search.strip()[:100]}%"
        conditions.append(
            or_(
                Content.title.ilike(needle),
                Content.title_cyrl.ilike(needle),
                Content.original_title.ilike(needle),
            )
        )

    order = SORT_OPTIONS.get(sort, SORT_OPTIONS["newest"])
    total = db.scalar(select(func.count(Content.id)).where(*conditions)) or 0
    items = (
        db.execute(
            select(Content)
            .where(*conditions)
            .order_by(*order)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return items, total


@router.get("/catalog")
def list_catalog(
    kind: str | None = Query(default=None),
    genre: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    sort: str = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=50),
    db: Session = Depends(get_db),
):
    items, total = _catalog_query(
        db,
        kind=kind,
        genre=genre,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [serialize_content(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/catalog/featured")
def featured_catalog(db: Session = Depends(get_db)):
    items = (
        db.execute(
            select(Content)
            .where(_published(), Content.is_featured.is_(True))
            .order_by(Content.updated_at.desc())
            .limit(6)
        )
        .scalars()
        .all()
    )
    return [serialize_content(item) for item in items]


@router.get("/home")
def home_feed(db: Session = Depends(get_db)):
    featured = (
        db.execute(
            select(Content)
            .where(_published(), Content.is_featured.is_(True))
            .order_by(Content.updated_at.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )
    if not featured:
        featured = (
            db.execute(
                select(Content).where(_published()).order_by(Content.created_at.desc()).limit(5)
            )
            .scalars()
            .all()
        )

    def row(kind: str | None = None, sort: str = "newest", limit: int = 14):
        items, _ = _catalog_query(
            db,
            kind=kind,
            genre=None,
            search=None,
            sort=sort,
            page=1,
            page_size=limit,
        )
        return [serialize_content(item) for item in items]

    return {
        "featured": [serialize_content(item) for item in featured],
        "rows": [
            {"key": "trending", "items": row(sort="popular")},
            {"key": "new", "items": row(sort="newest")},
            {"key": "movies", "items": row(kind="movie", sort="newest")},
            {"key": "series", "items": row(kind="series", sort="newest")},
        ],
    }


@router.get("/catalog/{identifier}")
def content_detail(identifier: str, db: Session = Depends(get_db)):
    content = None
    if identifier.isdigit():
        content = db.get(Content, int(identifier))
    if content is None:
        content = db.scalar(select(Content).where(Content.slug == identifier))
    if content is None or not content.is_published:
        raise HTTPException(status_code=404, detail="Kontent topilmadi")
    content = db.scalar(
        select(Content)
        .where(Content.id == content.id)
        .options(selectinload(Content.seasons).selectinload(Season.episodes))
    )
    assert content is not None
    return serialize_content(content, include_seasons=True)


@router.post("/catalog/{content_id}/view")
def track_view(
    content_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    content = db.get(Content, content_id)
    if content is None or not content.is_published:
        raise HTTPException(status_code=404, detail="Kontent topilmadi")

    from datetime import timedelta

    ip_hash = hash_ip(get_client_ip(request))
    cutoff = now_utc() - timedelta(minutes=30)
    recent = db.scalar(
        select(ViewEvent.id)
        .where(
            ViewEvent.content_id == content.id,
            ViewEvent.created_at >= cutoff,
            ViewEvent.user_id == (user.id if user else None),
            ViewEvent.ip_hash == (ip_hash if not user else None),
        )
        .limit(1)
    )
    if recent:
        return {"counted": False, "views_count": content.views_count}

    db.add(ViewEvent(content_id=content.id, user_id=user.id if user else None, ip_hash=ip_hash))
    content.views_count = (content.views_count or 0) + 1
    db.commit()
    return {"counted": True, "views_count": content.views_count}
