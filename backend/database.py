"""Database engine, sessions and lightweight versioned migrations."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, sessionmaker

from .config import settings
from .utils import iso_utc, now_utc

is_sqlite = settings.database_url.startswith("sqlite")

if settings.database_path is not None:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)

_engine_url = (
    f"sqlite:///{settings.database_path.as_posix()}" if settings.database_path is not None else settings.database_url
)

engine = create_engine(
    _engine_url,
    connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


if is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver callback
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _initial_schema(connection: Connection) -> None:
    from . import models  # noqa: F401  (register metadata)

    models.Base.metadata.create_all(bind=connection)


def _search_indexes(connection: Connection) -> None:
    connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_contents_title_lower ON contents (lower(title))")
    connection.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))")


MIGRATIONS = [
    ("0001_initial", _initial_schema),
    ("0002_search_indexes", _search_indexes),
]


def run_migrations() -> list[str]:
    applied: list[str] = []
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version VARCHAR(64) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)"
        )
        rows = connection.exec_driver_sql("SELECT version FROM schema_migrations").fetchall()
        done = {row[0] for row in rows}
        for version, upgrade in MIGRATIONS:
            if version in done:
                continue
            upgrade(connection)
            connection.exec_driver_sql(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
                if is_sqlite
                else "INSERT INTO schema_migrations (version, applied_at) VALUES (:v, :a)",
                (version, iso_utc(now_utc())) if is_sqlite else {"v": version, "a": iso_utc(now_utc())},
            )
            applied.append(version)
    return applied
