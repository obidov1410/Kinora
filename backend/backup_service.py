"""SQLite backup, validation and restore helpers."""
from __future__ import annotations

import re
import shutil
import sqlite3
from pathlib import Path

from .config import settings

NAME_PATTERN = re.compile(r"^(?:kinora|pre-restore)-\d{8}-\d{6}\.db$")
REQUIRED_TABLES = {"users", "contents", "ads", "settings", "schema_migrations", "audit_logs"}


class BackupError(RuntimeError):
    pass


def require_sqlite() -> Path:
    path = settings.database_path
    if path is None:
        raise BackupError("Avtomatik backup faqat SQLite ma'lumotlar bazasi uchun mavjud")
    if not path.exists():
        raise BackupError("Ma'lumotlar bazasi fayli hali yaratilmagan")
    return path


def create_backup(prefix: str = "kinora") -> dict:
    source_path = require_sqlite()
    settings.backups_path.mkdir(parents=True, exist_ok=True)
    from .utils import now_utc

    stamp = now_utc().strftime("%Y%m%d-%H%M%S")
    target = settings.backups_path / f"{prefix}-{stamp}.db"
    source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
        destination.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        destination.close()
        source.close()
    validate_backup_file(target)
    _apply_retention(keep=settings.backup_retention)
    stat = target.stat()
    return {"name": target.name, "bytes": stat.st_size, "created_at": stat.st_mtime, "path": str(target)}


def validate_backup_file(path: Path) -> None:
    if not path.exists() or path.stat().st_size < 512:
        raise BackupError("Backup fayli juda kichik yoki mavjud emas")
    with path.open("rb") as handle:
        if handle.read(16) != b"SQLite format 3\x00":
            raise BackupError("Fayl SQLite bazasi emas")
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        result = connection.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise BackupError("Backup yaxlitlik tekshiruvidan o'tmadi")
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        missing = REQUIRED_TABLES - tables
        if missing:
            raise BackupError(f"Backup kerakli jadvallarni o'z ichiga olmaydi: {', '.join(sorted(missing))}")
    finally:
        connection.close()


def list_backups() -> list[dict]:
    settings.backups_path.mkdir(parents=True, exist_ok=True)
    items = []
    for path in settings.backups_path.glob("*.db"):
        if not NAME_PATTERN.match(path.name):
            continue
        stat = path.stat()
        items.append(
            {
                "name": path.name,
                "bytes": stat.st_size,
                "created_at": stat.st_mtime,
                "kind": "pre-restore" if path.name.startswith("pre-restore") else "manual",
            }
        )
    return sorted(items, key=lambda item: item["created_at"], reverse=True)


def resolve_backup(name: str) -> Path:
    if not NAME_PATTERN.match(name):
        raise BackupError("Backup nomi noto'g'ri")
    path = (settings.backups_path / name).resolve()
    if path.parent != settings.backups_path.resolve():
        raise BackupError("Backup yo'li noto'g'ri")
    if not path.exists():
        raise BackupError("Backup topilmadi")
    return path


def perform_restore(name: str) -> dict:
    target = require_sqlite()
    source = resolve_backup(name)
    validate_backup_file(source)

    pre = create_backup(prefix="pre-restore")

    from .database import engine

    engine.dispose()
    for suffix in ("-wal", "-shm"):
        stale = Path(str(target) + suffix)
        if stale.exists():
            stale.unlink()
    shutil.copy2(source, target)
    engine.dispose()
    validate_backup_file(target)
    return {"restored_from": name, "safety_backup": pre["name"]}


def _apply_retention(keep: int) -> None:
    if keep <= 0:
        return
    backups = list_backups()
    manual = [item for item in backups if item["kind"] == "manual"]
    for item in manual[keep:]:
        try:
            (settings.backups_path / item["name"]).unlink()
        except OSError:
            pass
