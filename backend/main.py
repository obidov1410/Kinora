"""Kinora API entrypoint."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .backup_service import BackupError, create_backup
from .config import settings
from .database import SessionLocal, engine, run_migrations
from .routes import (
    admin_ads,
    admin_backup,
    admin_content,
    admin_settings,
    admin_stats,
    admin_users,
    ads,
    auth,
    media,
    public,
    uploads,
    vip,
)
from .security import RateLimitMiddleware, SecurityHeadersMiddleware
from .seed import seed_demo_data
from .utils import iso_utc, now_utc

logger = logging.getLogger("kinora")


async def _backup_loop(interval_hours: int) -> None:
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            info = await asyncio.to_thread(create_backup)
            logger.info("Scheduled backup created: %s", info["name"])
        except (BackupError, OSError) as exc:
            logger.warning("Scheduled backup failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    applied = run_migrations()
    if applied:
        logger.info("Applied migrations: %s", ", ".join(applied))
    if settings.seed_demo:
        if seed_demo_data():
            logger.info("Demo catalog seeded")
    backup_task = None
    if settings.backup_interval_hours > 0 and settings.database_path is not None:
        backup_task = asyncio.create_task(_backup_loop(settings.backup_interval_hours))
    yield
    if backup_task:
        backup_task.cancel()
        try:
            await backup_task
        except asyncio.CancelledError:
            pass
    engine.dispose()


app = FastAPI(
    title="Kinora API",
    version="1.0.0",
    description=(
        "Kinora film va seriallar katalogi API. Telegram Mini App initData "
        "imzosi serverda BOT_TOKEN bilan tekshiriladi. Admin endpointlari har "
        "so'rovda ma'lumotlar bazasidagi rolni tekshiradi."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/uploads", StaticFiles(directory=str(settings.uploads_path)), name="uploads")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", []) if part not in {"body", "query", "path"}]
        errors.append({"field": ".".join(location), "message": error.get("msg", "Noto'g'ri qiymat")})
    return JSONResponse(
        status_code=422,
        content={"detail": "Kiritilgan ma'lumotlarda xatolik bor", "errors": errors},
    )


@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["health"])
def health():
    database_ok = True
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover - depends on external failure mode
        database_ok = False
    return {
        "status": "ok" if database_ok else "degraded",
        "database": "ok" if database_ok else "error",
        "telegram_configured": settings.telegram_configured,
        "payment_provider": settings.payment_provider,
        "environment": settings.env,
        "time": iso_utc(now_utc()),
        "version": "1.0.0",
    }


@app.get("/", include_in_schema=False)
def root():
    return {
        "name": "Kinora API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }


for router in (
    auth.router,
    public.router,
    ads.router,
    vip.router,
    media.router,
    uploads.router,
    admin_content.router,
    admin_ads.router,
    admin_users.router,
    admin_stats.router,
    admin_settings.router,
    admin_backup.router,
):
    app.include_router(router, prefix="/api")
