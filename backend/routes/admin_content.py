"""Admin content, season and episode management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..auth import require_admin
from ..database import get_db
from ..models import Content, Episode, Season, User
from ..schemas import (
    ContentIn,
    ContentUpdate,
    EpisodeIn,
    EpisodeReorderIn,
    EpisodeUpdate,
    SeasonIn,
    SeasonUpdate,
)
from ..serializers import serialize_content, serialize_episode, serialize_season
from ..services import record_audit, unique_slug
from ..utils import now_utc

router = APIRouter(tags=["admin-content"])


def _load_content(db: Session, content_id: int) -> Content:
    content = db.scalar(
        select(Content)
        .where(Content.id == content_id)
        .options(selectinload(Content.seasons).selectinload(Season.episodes))
    )
    if content is None:
        raise HTTPException(status_code=404, detail="Kontent topilmadi")
    return content


@router.get("/admin/content")
def admin_list_content(
    search: str | None = Query(default=None, max_length=100),
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conditions = []
    if kind in {"movie", "series"}:
        conditions.append(Content.kind == kind)
    if status == "published":
        conditions.append(Content.is_published.is_(True))
    elif status == "draft":
        conditions.append(Content.is_published.is_(False))
    elif status == "featured":
        conditions.append(Content.is_featured.is_(True))
    if search:
        needle = f"%{search.strip()}%"
        conditions.append(
            or_(
                Content.title.ilike(needle),
                Content.title_cyrl.ilike(needle),
                Content.original_title.ilike(needle),
            )
        )
    total = db.scalar(select(func.count(Content.id)).where(*conditions)) or 0
    items = (
        db.execute(
            select(Content)
            .where(*conditions)
            .order_by(Content.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return {
        "items": [serialize_content(item, admin=True) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/admin/content/{content_id}")
def admin_get_content(
    content_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    content = _load_content(db, content_id)
    return serialize_content(content, admin=True, include_seasons=True, preview_media=True)


def _assert_video_consistency(data: dict) -> None:
    source = data.get("video_source")
    if source == "url" and not data.get("video_url"):
        raise HTTPException(status_code=400, detail="URL video uchun video_url kiritilishi shart")
    if source == "telegram" and not data.get("telegram_file_id"):
        raise HTTPException(status_code=400, detail="Telegram video uchun telegram_file_id kiritilishi shart")
    if not source and (data.get("video_url") or data.get("telegram_file_id")):
        raise HTTPException(status_code=400, detail="Video manbasi turini tanlang")


@router.post("/admin/content", status_code=201)
def create_content(
    payload: ContentIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    content = Content(**payload.model_dump(), slug=unique_slug(db, payload.title))
    db.add(content)
    db.flush()
    record_audit(
        db,
        admin,
        "content.create",
        target_type="content",
        target_id=content.id,
        details={"title": content.title, "kind": content.kind, "published": content.is_published},
        request=request,
    )
    db.commit()
    db.refresh(content)
    return serialize_content(_load_content(db, content.id), admin=True, include_seasons=True, preview_media=True)


@router.patch("/admin/content/{content_id}")
def update_content(
    content_id: int,
    payload: ContentUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    content = _load_content(db, content_id)
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes and not changes["title"]:
        raise HTTPException(status_code=400, detail="Sarlavha bo'sh bo'lishi mumkin emas")
    if "year" in changes and changes["year"] is None:
        raise HTTPException(status_code=400, detail="Yil kiritilishi shart")
    prospective = {
        "video_source": content.video_source,
        "video_url": content.video_url,
        "telegram_file_id": content.telegram_file_id,
    }
    prospective.update({key: changes[key] for key in prospective if key in changes})
    _assert_video_consistency(prospective)

    for field, value in changes.items():
        setattr(content, field, value)
    if content.video_source == "url":
        content.telegram_file_id = None
    elif content.video_source == "telegram":
        content.video_url = None
    elif content.video_source is None:
        content.video_url = None
        content.telegram_file_id = None
    content.updated_at = now_utc()
    record_audit(
        db,
        admin,
        "content.update",
        target_type="content",
        target_id=content.id,
        details={"title": content.title, "fields": sorted(changes.keys())},
        request=request,
    )
    db.commit()
    return serialize_content(_load_content(db, content_id), admin=True, include_seasons=True, preview_media=True)


@router.delete("/admin/content/{content_id}")
def delete_content(
    content_id: int,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    content = _load_content(db, content_id)
    title = content.title
    db.delete(content)
    record_audit(
        db,
        admin,
        "content.delete",
        target_type="content",
        target_id=content_id,
        details={"title": title},
        request=request,
    )
    db.commit()
    return {"deleted": True}


@router.post("/admin/content/{content_id}/seasons", status_code=201)
def create_season(
    content_id: int,
    payload: SeasonIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    content = _load_content(db, content_id)
    if content.kind != "series":
        raise HTTPException(status_code=400, detail="Mavsumlar faqat seriallar uchun qo'shiladi")
    season = Season(content_id=content.id, number=payload.number, title=payload.title)
    db.add(season)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu raqamli mavsum allaqachon mavjud") from None
    record_audit(
        db,
        admin,
        "season.create",
        target_type="season",
        target_id=season.id,
        details={"content_id": content.id, "number": season.number},
        request=request,
    )
    db.commit()
    db.refresh(season)
    return serialize_season(season, admin=True)


@router.patch("/admin/seasons/{season_id}")
def update_season(
    season_id: int,
    payload: SeasonUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Mavsum topilmadi")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(season, field, value)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu raqamli mavsum allaqachon mavjud") from None
    record_audit(
        db,
        admin,
        "season.update",
        target_type="season",
        target_id=season.id,
        details={"content_id": season.content_id},
        request=request,
    )
    db.commit()
    return serialize_season(season, admin=True)


@router.delete("/admin/seasons/{season_id}")
def delete_season(
    season_id: int,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    season = db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Mavsum topilmadi")
    content_id = season.content_id
    db.delete(season)
    record_audit(
        db,
        admin,
        "season.delete",
        target_type="season",
        target_id=season_id,
        details={"content_id": content_id},
        request=request,
    )
    db.commit()
    return {"deleted": True}


@router.post("/admin/seasons/{season_id}/episodes", status_code=201)
def create_episode(
    season_id: int,
    payload: EpisodeIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Mavsum topilmadi")
    episode = Episode(season_id=season.id, **payload.model_dump())
    db.add(episode)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu raqamli qism allaqachon mavjud") from None
    record_audit(
        db,
        admin,
        "episode.create",
        target_type="episode",
        target_id=episode.id,
        details={"season_id": season.id, "number": episode.number},
        request=request,
    )
    db.commit()
    db.refresh(episode)
    return serialize_episode(episode, admin=True)


@router.patch("/admin/episodes/{episode_id}")
def update_episode(
    episode_id: int,
    payload: EpisodeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Qism topilmadi")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(episode, field, value)
    if episode.video_source == "url":
        episode.telegram_file_id = None
        if not episode.video_url:
            raise HTTPException(status_code=400, detail="video_url kiritilishi shart")
    elif episode.video_source == "telegram":
        episode.video_url = None
        if not episode.telegram_file_id:
            raise HTTPException(status_code=400, detail="telegram_file_id kiritilishi shart")
    else:
        episode.video_url = None
        episode.telegram_file_id = None
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu raqamli qism allaqachon mavjud") from None
    record_audit(
        db,
        admin,
        "episode.update",
        target_type="episode",
        target_id=episode.id,
        details={"season_id": episode.season_id},
        request=request,
    )
    db.commit()
    return serialize_episode(episode, admin=True)


@router.delete("/admin/episodes/{episode_id}")
def delete_episode(
    episode_id: int,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Qism topilmadi")
    season_id = episode.season_id
    db.delete(episode)
    record_audit(
        db,
        admin,
        "episode.delete",
        target_type="episode",
        target_id=episode_id,
        details={"season_id": season_id},
        request=request,
    )
    db.commit()
    return {"deleted": True}


@router.post("/admin/seasons/{season_id}/episodes/reorder")
def reorder_episodes(
    season_id: int,
    payload: EpisodeReorderIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    season = db.scalar(
        select(Season).where(Season.id == season_id).options(selectinload(Season.episodes))
    )
    if not season:
        raise HTTPException(status_code=404, detail="Mavsum topilmadi")
    episodes = {episode.id: episode for episode in season.episodes}
    if set(payload.episode_ids) != set(episodes.keys()):
        raise HTTPException(status_code=400, detail="Barcha qism ID'lari to'liq yuborilishi kerak")

    for episode in episodes.values():
        episode.number = -episode.id
    db.flush()
    for index, episode_id in enumerate(payload.episode_ids, start=1):
        episodes[episode_id].number = index
    record_audit(
        db,
        admin,
        "episode.reorder",
        target_type="season",
        target_id=season.id,
        details={"order": payload.episode_ids},
        request=request,
    )
    db.commit()
    db.expire_all()
    season = db.scalar(
        select(Season).where(Season.id == season_id).options(selectinload(Season.episodes))
    )
    assert season is not None
    return serialize_season(season, admin=True)
