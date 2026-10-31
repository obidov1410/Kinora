"""Response serializers. Never leak secrets or Telegram file ids publicly."""
from __future__ import annotations

from datetime import datetime

from .auth import effective_role, sign_media_token
from .config import settings
from .models import Ad, Content, Episode, Season, User, VipPlan
from .utils import iso_utc, now_utc


def is_vip(user: User | None) -> bool:
    return bool(user and user.vip_until and user.vip_until > now_utc())


def serialize_user(user: User, *, include_telegram: bool = True) -> dict:
    return {
        "id": user.id,
        "telegram_id": user.telegram_id if include_telegram else None,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "photo_url": user.photo_url,
        "language": user.language,
        "role": effective_role(user),
        "is_blocked": user.is_blocked,
        "vip_until": iso_utc(user.vip_until),
        "is_vip": is_vip(user),
        "visit_count": user.visit_count,
        "created_at": iso_utc(user.created_at),
        "last_seen_at": iso_utc(user.last_seen_at),
    }


def _playback(source: str | None, url: str | None, file_id: str | None, kind: str, resource_id: int) -> dict | None:
    if source == "url" and url:
        return {"type": "direct", "url": url}
    if source == "telegram" and file_id and settings.telegram_configured:
        token = sign_media_token(kind, resource_id)
        return {"type": "telegram", "url": f"/api/media/stream/{kind}/{resource_id}?token={token}"}
    return None


def serialize_episode(episode: Episode, *, admin: bool = False) -> dict:
    data = {
        "id": episode.id,
        "number": episode.number,
        "title": episode.title,
        "description": episode.description,
        "duration_minutes": episode.duration_minutes,
        "playback": _playback(episode.video_source, episode.video_url, episode.telegram_file_id, "episode", episode.id),
        "created_at": iso_utc(episode.created_at),
    }
    if admin:
        data.update(
            {
                "video_source": episode.video_source,
                "video_url": episode.video_url,
                "telegram_file_id": episode.telegram_file_id,
            }
        )
    return data


def serialize_season(season: Season, *, admin: bool = False) -> dict:
    return {
        "id": season.id,
        "number": season.number,
        "title": season.title,
        "episodes": [serialize_episode(episode, admin=admin) for episode in season.episodes],
    }


def serialize_content(
    content: Content,
    *,
    admin: bool = False,
    include_seasons: bool = False,
    preview_media: bool = False,
) -> dict:
    data = {
        "id": content.id,
        "slug": content.slug,
        "kind": content.kind,
        "title": content.title,
        "title_cyrl": content.title_cyrl,
        "original_title": content.original_title,
        "year": content.year,
        "genres": content.genres or [],
        "country": content.country,
        "age_rating": content.age_rating,
        "description": content.description,
        "description_cyrl": content.description_cyrl,
        "poster_url": content.poster_url,
        "backdrop_url": content.backdrop_url,
        "trailer_url": content.trailer_url,
        "duration_minutes": content.duration_minutes,
        "is_featured": content.is_featured,
        "is_published": content.is_published,
        "is_demo": content.is_demo,
        "views_count": content.views_count,
        "created_at": iso_utc(content.created_at),
        "updated_at": iso_utc(content.updated_at),
        "license_note": content.license_note,
        "playback": _playback(content.video_source, content.video_url, content.telegram_file_id, "content", content.id),
    }
    if admin or preview_media:
        data.update(
            {
                "video_source": content.video_source,
                "video_url": content.video_url,
                "telegram_file_id": content.telegram_file_id,
            }
        )
    if include_seasons:
        data["seasons"] = [serialize_season(season, admin=admin) for season in content.seasons]
    return data


def ad_status(ad: Ad) -> str:
    if not ad.is_active:
        return "paused"
    current = now_utc()
    if ad.starts_at and ad.starts_at > current:
        return "scheduled"
    if ad.ends_at and ad.ends_at < current:
        return "expired"
    return "active"


def serialize_ad_public(ad: Ad) -> dict:
    return {
        "id": ad.id,
        "advertiser": ad.advertiser,
        "title": ad.title,
        "description": ad.description,
        "image_url": ad.image_url,
        "placement": ad.placement,
        "sponsored": True,
        "label": "Reklama",
        "is_demo": ad.is_demo,
        "impression_url": f"/api/ads/{ad.id}/impression",
        "click_url": f"/api/ads/{ad.id}/click",
    }


def serialize_ad_admin(ad: Ad) -> dict:
    return {
        "id": ad.id,
        "advertiser": ad.advertiser,
        "title": ad.title,
        "description": ad.description,
        "image_url": ad.image_url,
        "destination_url": ad.destination_url,
        "placement": ad.placement,
        "starts_at": iso_utc(ad.starts_at),
        "ends_at": iso_utc(ad.ends_at),
        "is_active": ad.is_active,
        "is_demo": ad.is_demo,
        "impressions": ad.impressions,
        "clicks": ad.clicks,
        "ctr": round((ad.clicks / ad.impressions) * 100, 2) if ad.impressions else 0.0,
        "status": ad_status(ad),
        "created_at": iso_utc(ad.created_at),
        "updated_at": iso_utc(ad.updated_at),
    }


def serialize_plan(plan: VipPlan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "name_cyrl": plan.name_cyrl,
        "days": plan.days,
        "price": plan.price,
        "currency": plan.currency,
        "benefits": plan.benefits,
        "is_active": plan.is_active,
        "sort_order": plan.sort_order,
    }


def ad_is_live(ad: Ad, at: datetime | None = None) -> bool:
    current = at or now_utc()
    if not ad.is_active:
        return False
    if ad.starts_at and ad.starts_at > current:
        return False
    if ad.ends_at and ad.ends_at < current:
        return False
    return True
