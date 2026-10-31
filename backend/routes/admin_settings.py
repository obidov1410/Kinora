"""Admin settings, VIP plans and payment reporting."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..config import settings
from ..database import get_db
from ..models import Transaction, User, VipPlan
from ..payments import get_provider
from ..schemas import SettingsUpdate, VipPlanIn
from ..serializers import serialize_plan
from ..services import get_setting, record_audit, set_setting
from ..utils import iso_utc, now_utc

router = APIRouter(tags=["admin-settings"])


@router.get("/admin/settings")
def get_admin_settings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return {
        "vip_enabled": bool(get_setting(db, "vip_enabled", False)),
        "site_notice": get_setting(db, "site_notice", ""),
        "runtime": {
            "environment": settings.env,
            "telegram_configured": settings.telegram_configured,
            "bot_username": settings.bot_username,
            "owner_id": settings.owner_id,
            "payment_provider": settings.payment_provider,
            "payment_provider_configured": get_provider().configured,
            "dev_login_allowed": settings.dev_login_allowed,
            "rate_limit_enabled": settings.rate_limit_enabled,
            "rate_limit_per_minute": settings.rate_limit_per_minute,
            "max_upload_mb": settings.max_upload_mb,
            "backup_interval_hours": settings.backup_interval_hours,
            "session_ttl_hours": settings.session_ttl_hours,
            "data_backend": "sqlite" if settings.database_url.startswith("sqlite") else "external",
        },
    }


@router.patch("/admin/settings")
def update_admin_settings(
    payload: SettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        set_setting(db, key, value)
    record_audit(
        db,
        admin,
        "settings.update",
        target_type="settings",
        target_id="general",
        details=changes,
        request=request,
    )
    db.commit()
    return {
        "vip_enabled": bool(get_setting(db, "vip_enabled", False)),
        "site_notice": get_setting(db, "site_notice", ""),
    }


@router.get("/admin/vip/plans")
def admin_plans(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    plans = db.execute(select(VipPlan).order_by(VipPlan.sort_order, VipPlan.days)).scalars().all()
    return [serialize_plan(plan) for plan in plans]


@router.post("/admin/vip/plans", status_code=201)
def create_plan(
    payload: VipPlanIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    plan = VipPlan(**payload.model_dump())
    db.add(plan)
    db.flush()
    record_audit(
        db,
        admin,
        "vip_plan.create",
        target_type="vip_plan",
        target_id=plan.id,
        details={"name": plan.name, "days": plan.days, "price": plan.price},
        request=request,
    )
    db.commit()
    db.refresh(plan)
    return serialize_plan(plan)


@router.patch("/admin/vip/plans/{plan_id}")
def update_plan(
    plan_id: int,
    payload: VipPlanIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    plan = db.get(VipPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Tarif topilmadi")
    for field, value in payload.model_dump().items():
        setattr(plan, field, value)
    record_audit(
        db,
        admin,
        "vip_plan.update",
        target_type="vip_plan",
        target_id=plan.id,
        details={"name": plan.name},
        request=request,
    )
    db.commit()
    db.refresh(plan)
    return serialize_plan(plan)


@router.delete("/admin/vip/plans/{plan_id}")
def delete_plan(
    plan_id: int,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    plan = db.get(VipPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Tarif topilmadi")
    name = plan.name
    db.delete(plan)
    record_audit(
        db,
        admin,
        "vip_plan.delete",
        target_type="vip_plan",
        target_id=plan_id,
        details={"name": name},
        request=request,
    )
    db.commit()
    return {"deleted": True}


@router.get("/admin/transactions")
def list_transactions(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conditions = []
    if status in {"pending", "paid", "failed"}:
        conditions.append(Transaction.status == status)
    total = db.scalar(select(func.count(Transaction.id)).where(*conditions)) or 0
    paid_total = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.status == "paid")
    ) or 0
    rows = db.execute(
        select(Transaction, User)
        .join(User, Transaction.user_id == User.id)
        .where(*conditions)
        .order_by(Transaction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [
            {
                "id": tx.id,
                "user": {
                    "id": user.id,
                    "first_name": user.first_name,
                    "username": user.username,
                    "telegram_id": user.telegram_id,
                },
                "provider": tx.provider,
                "amount": tx.amount,
                "currency": tx.currency,
                "status": tx.status,
                "external_id": tx.external_id,
                "created_at": iso_utc(tx.created_at),
                "paid_at": iso_utc(tx.paid_at),
            }
            for tx, user in rows
        ],
        "total": total,
        "paid_total": paid_total,
        "payment_configured": get_provider().configured,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }
