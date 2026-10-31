"""Protected database backup management."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..backup_service import (
    BackupError,
    create_backup,
    list_backups,
    perform_restore,
    resolve_backup,
)
from ..database import SessionLocal, get_db
from ..models import AuditLog, User
from ..schemas import BackupRestoreIn
from ..services import record_audit
from ..utils import now_utc

router = APIRouter(tags=["admin-backups"])


@router.get("/admin/backups")
def get_backups(admin: User = Depends(require_admin)):
    return {"items": list_backups()}


@router.post("/admin/backups", status_code=201)
def make_backup(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        backup = create_backup()
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    record_audit(
        db,
        admin,
        "backup.create",
        target_type="backup",
        target_id=backup["name"],
        details={"bytes": backup["bytes"]},
        request=request,
    )
    db.commit()
    backup.pop("path", None)
    return backup


@router.get("/admin/backups/{name}/download")
def download_backup(name: str, admin: User = Depends(require_admin)):
    try:
        path = resolve_backup(name)
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=path.name,
        headers={"Cache-Control": "no-store"},
    )


@router.delete("/admin/backups/{name}")
def delete_backup(
    name: str,
    request: Request,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="O'chirish uchun confirm=true yuboring")
    try:
        path = resolve_backup(name)
        path.unlink()
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    record_audit(
        db,
        admin,
        "backup.delete",
        target_type="backup",
        target_id=name,
        request=request,
    )
    db.commit()
    return {"deleted": True}


@router.post("/admin/backups/{name}/restore")
def restore_backup(
    name: str,
    payload: BackupRestoreIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    actor_telegram_id = admin.telegram_id
    db.close()
    try:
        result = perform_restore(name)
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    # The old session/database is gone; write the audit entry into the restored DB.
    audit_session = SessionLocal()
    try:
        audit_session.add(
            AuditLog(
                actor_id=None,
                actor_telegram_id=actor_telegram_id,
                action="backup.restore",
                target_type="backup",
                target_id=name,
                details=result,
                created_at=now_utc(),
            )
        )
        audit_session.commit()
    finally:
        audit_session.close()
    return {"restored": True, **result}
