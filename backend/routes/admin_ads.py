"""Admin advertisement management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import Ad, User
from ..schemas import AdIn, AdUpdate
from ..serializers import ad_is_live, ad_status, serialize_ad_admin
from ..services import record_audit
from ..utils import naive_utc, now_utc

router = APIRouter(tags=["admin-ads"])


@router.get("/admin/ads")
def admin_list_ads(
    search: str | None = Query(default=None, max_length=100),
    placement: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conditions = []
    now = now_utc()
    if placement:
        conditions.append(Ad.placement == placement)
    if search:
        needle = f"%{search.strip()}%"
        conditions.append(or_(Ad.title.ilike(needle), Ad.advertiser.ilike(needle)))
    if status == "paused":
        conditions.append(Ad.is_active.is_(False))
    elif status == "active":
        conditions.extend(
            [
                Ad.is_active.is_(True),
                or_(Ad.starts_at.is_(None), Ad.starts_at <= now),
                or_(Ad.ends_at.is_(None), Ad.ends_at >= now),
            ]
        )
    elif status == "scheduled":
        conditions.extend([Ad.is_active.is_(True), Ad.starts_at > now])
    elif status == "expired":
        conditions.extend([Ad.is_active.is_(True), Ad.ends_at < now])
    total = db.scalar(select(func.count(Ad.id)).where(*conditions)) or 0
    ads = (
        db.execute(
            select(Ad)
            .where(*conditions)
            .order_by(Ad.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return {
        "items": [serialize_ad_admin(ad) for ad in ads],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/admin/ads/{ad_id}")
def admin_get_ad(ad_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Reklama topilmadi")
    data = serialize_ad_admin(ad)
    data["is_live"] = ad_is_live(ad)
    return data


@router.post("/admin/ads", status_code=201)
def create_ad(
    payload: AdIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    data = payload.model_dump()
    data["starts_at"] = naive_utc(data["starts_at"])
    data["ends_at"] = naive_utc(data["ends_at"])
    ad = Ad(**data)
    db.add(ad)
    db.flush()
    record_audit(
        db,
        admin,
        "ad.create",
        target_type="ad",
        target_id=ad.id,
        details={"title": ad.title, "placement": ad.placement, "advertiser": ad.advertiser},
        request=request,
    )
    db.commit()
    db.refresh(ad)
    return serialize_ad_admin(ad)


@router.patch("/admin/ads/{ad_id}")
def update_ad(
    ad_id: int,
    payload: AdUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Reklama topilmadi")
    changes = payload.model_dump(exclude_unset=True)
    for field in ("starts_at", "ends_at"):
        if field in changes:
            changes[field] = naive_utc(changes[field])
    for field, value in changes.items():
        setattr(ad, field, value)
    if ad.starts_at and ad.ends_at and ad.ends_at <= ad.starts_at:
        raise HTTPException(status_code=400, detail="Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak")
    ad.updated_at = now_utc()
    record_audit(
        db,
        admin,
        "ad.update",
        target_type="ad",
        target_id=ad.id,
        details={"title": ad.title, "fields": sorted(changes.keys())},
        request=request,
    )
    db.commit()
    db.refresh(ad)
    return serialize_ad_admin(ad)


@router.delete("/admin/ads/{ad_id}")
def delete_ad(
    ad_id: int,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Reklama topilmadi")
    title = ad.title
    db.delete(ad)
    record_audit(
        db,
        admin,
        "ad.delete",
        target_type="ad",
        target_id=ad_id,
        details={"title": title},
        request=request,
    )
    db.commit()
    return {"deleted": True}
