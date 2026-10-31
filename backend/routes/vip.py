"""Public VIP plans and checkout gate."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import User, VipPlan
from ..payments import get_provider
from ..serializers import serialize_plan
from ..services import get_setting

router = APIRouter(tags=["vip"])


@router.get("/vip/plans")
def vip_plans(db: Session = Depends(get_db)):
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
        "enabled": enabled,
        "payment_configured": get_provider().configured,
        "plans": [serialize_plan(plan) for plan in plans],
    }


@router.post("/vip/checkout/{plan_id}")
def start_checkout(
    plan_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_setting(db, "vip_enabled", False):
        raise HTTPException(status_code=404, detail="VIP hozircha faol emas")
    plan = db.get(VipPlan, plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(status_code=404, detail="Tarif topilmadi")
    provider = get_provider()
    if not provider.configured:
        raise HTTPException(
            status_code=503,
            detail=(
                "To'lov tizimi hali ulanmagan. Administrator to'lov provayderini "
                "sozlagach, bu tugma faollashadi. Hozircha VIP'ni faqat admin qo'lda bera oladi."
            ),
        )
    session = provider.create_checkout(db, user, plan)
    db.commit()
    return {"checkout_url": session.url, "external_id": session.external_id}
