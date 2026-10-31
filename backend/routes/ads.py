"""Public advertising placements with impression/click tracking."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_client_ip
from ..constants import PLACEMENTS
from ..database import get_db
from ..models import Ad, AdEvent
from ..serializers import ad_is_live, serialize_ad_public
from ..utils import hash_ip, now_utc

router = APIRouter(tags=["ads"])


@router.get("/ads")
def list_ads(
    placement: str | None = Query(default=None),
    limit: int = Query(default=3, ge=1, le=10),
    db: Session = Depends(get_db),
):
    if placement is not None and placement not in PLACEMENTS:
        raise HTTPException(status_code=400, detail="Reklama joylashuvi noto'g'ri")
    query = select(Ad).where(Ad.is_active.is_(True))
    if placement:
        query = query.where(Ad.placement == placement)
    ads = db.execute(query.order_by(Ad.created_at.desc()).limit(limit * 2)).scalars().all()
    live = [ad for ad in ads if ad_is_live(ad)][:limit]
    return [serialize_ad_public(ad) for ad in live]


def _get_live_ad(db: Session, ad_id: int) -> Ad:
    ad = db.get(Ad, ad_id)
    if not ad or not ad_is_live(ad):
        raise HTTPException(status_code=404, detail="Reklama faol emas")
    return ad


@router.post("/ads/{ad_id}/impression")
def track_impression(ad_id: int, request: Request, db: Session = Depends(get_db)):
    ad = _get_live_ad(db, ad_id)
    ip_hash = hash_ip(get_client_ip(request))
    day_start = now_utc() - timedelta(hours=24)
    duplicate = db.scalar(
        select(AdEvent.id)
        .where(
            AdEvent.ad_id == ad.id,
            AdEvent.event_type == "impression",
            AdEvent.ip_hash == ip_hash,
            AdEvent.created_at >= day_start,
        )
        .limit(1)
    )
    if duplicate:
        return {"counted": False, "impressions": ad.impressions}
    db.add(AdEvent(ad_id=ad.id, event_type="impression", ip_hash=ip_hash))
    ad.impressions = (ad.impressions or 0) + 1
    db.commit()
    return {"counted": True, "impressions": ad.impressions}


@router.get("/ads/{ad_id}/click")
def track_click(ad_id: int, request: Request, db: Session = Depends(get_db)):
    ad = _get_live_ad(db, ad_id)
    db.add(AdEvent(ad_id=ad.id, event_type="click", ip_hash=hash_ip(get_client_ip(request))))
    ad.clicks = (ad.clicks or 0) + 1
    db.commit()
    return RedirectResponse(url=ad.destination_url, status_code=302, headers={"Cache-Control": "no-store"})
