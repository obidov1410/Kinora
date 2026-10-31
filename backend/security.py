"""Rate limiting and security headers."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Small in-process sliding-window limiter.

    Adequate for a single Render instance. For multiple instances use Redis.
    """

    EXEMPT_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}

    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled or request.method == "OPTIONS" or request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        forwarded = request.headers.get("x-forwarded-for")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        now = time.monotonic()
        bucket = self.hits[ip]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= settings.rate_limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "So'rovlar soni juda ko'p. Bir daqiqadan so'ng urinib ko'ring."},
                headers={"Retry-After": "60"},
            )
        bucket.append(now)
        if len(self.hits) > 5000:
            for key in [key for key, value in self.hits.items() if not value][:1000]:
                self.hits.pop(key, None)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
