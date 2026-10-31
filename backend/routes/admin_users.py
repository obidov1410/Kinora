"""Admin user management, roles, blocking and VIP grants."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import effective_role, require_admin, require_owner
from ..config import settings
from ..database import get_db
from ..models import AuditLog, Favorite, Transaction, User
from ..schemas import RoleUpdate, UserAdminUpdate
from ..serializers import serialize_user
from ..services import grant_vip, record_audit
from ..utils import iso_utc, now_utc

router = APIRouter(tags=["admin-users"])


@router.get("/admin/users")
def list_users(
    search: str | None = Query(default=None, max_length=100),
    filter: str = Query(default="all"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    conditions = []
    if search:
        needle = f"%{search.strip()}%"
        conditions.append(
            or_(
                User.username.ilike(needle),
                User.first_name.ilike(needle),
                User.last_name.ilike(needle),
            )
        )
        if search.strip().isdigit():
            conditions.append(User.telegram_id == int(search.strip()))
            conditions = [or_(*conditions)] if len(conditions) == 2 else conditions
    if filter == "vip":
        conditions.append(User.vip_until > now_utc())
    elif filter == "blocked":
        conditions.append(User.is_blocked.is_(True))
    elif filter == "admins":
        conditions.append(User.role.in_(["owner", "admin"]))

    total = db.scalar(select(func.count(User.id)).where(*conditions)) or 0
    users = (
        db.execute(
            select(User)
            .where(*conditions)
            .order_by(User.last_seen_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return {
        "items": [serialize_user(user) for user in users],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/admin/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    data = serialize_user(user)
    data["favorites_count"] = db.scalar(select(func.count(Favorite.id)).where(Favorite.user_id == user.id)) or 0
    data["transactions"] = [
        {
            "id": tx.id,
            "provider": tx.provider,
            "amount": tx.amount,
            "currency": tx.currency,
            "status": tx.status,
            "created_at": iso_utc(tx.created_at),
            "paid_at": iso_utc(tx.paid_at),
        }
        for tx in db.execute(
            select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).limit(10)
        )
        .scalars()
        .all()
    ]
    data["audit"] = [
        {
            "action": log.action,
            "created_at": iso_utc(log.created_at),
            "actor_telegram_id": log.actor_telegram_id,
        }
        for log in db.execute(
            select(AuditLog).where(AuditLog.actor_id == user.id).order_by(AuditLog.created_at.desc()).limit(10)
        )
        .scalars()
        .all()
    ]
    return data


@router.patch("/admin/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserAdminUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    if user.telegram_id == settings.owner_id:
        raise HTTPException(status_code=400, detail="Egasi hisobini o'zgartirish mumkin emas")
    if effective_role(user) in {"owner", "admin"} and effective_role(admin) != "owner":
        raise HTTPException(status_code=403, detail="Boshqa adminni faqat egasi o'zgartira oladi")
    if user.id == admin.id and payload.is_blocked:
        raise HTTPException(status_code=400, detail="O'zingizni bloklay olmaysiz")

    changes: dict = {}
    if payload.is_blocked is not None:
        user.is_blocked = payload.is_blocked
        changes["is_blocked"] = payload.is_blocked
    if payload.vip_days is not None:
        grant_vip(user, payload.vip_days)
        changes["vip_until"] = iso_utc(user.vip_until)
    if payload.language is not None:
        user.language = payload.language
        changes["language"] = payload.language

    record_audit(
        db,
        admin,
        "user.update",
        target_type="user",
        target_id=user.id,
        details=changes,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.post("/admin/users/{user_id}/role")
def update_role(
    user_id: int,
    payload: RoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    owner: User = Depends(require_owner),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    if user.telegram_id == settings.owner_id or effective_role(user) == "owner":
        raise HTTPException(status_code=400, detail="Egasi rolini o'zgartirish mumkin emas")
    if user.id == owner.id:
        raise HTTPException(status_code=400, detail="O'z rolingizni o'zgartira olmaysiz")
    user.role = payload.role
    record_audit(
        db,
        owner,
        "user.role",
        target_type="user",
        target_id=user.id,
        details={"role": payload.role, "telegram_id": user.telegram_id},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return serialize_user(user)
