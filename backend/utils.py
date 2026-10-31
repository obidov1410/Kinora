"""Small shared helpers used across the backend."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from .config import settings


def now_utc() -> datetime:
    """Naive UTC timestamp (SQLite stores naive datetimes consistently)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def start_of_day(days_ago: int = 0) -> datetime:
    current = now_utc() - timedelta(days=days_ago)
    return current.replace(hour=0, minute=0, second=0, microsecond=0)


_SLUG_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu",
    "я": "ya", "ў": "u", "қ": "q", "ғ": "g", "ҳ": "h", "’": "", "'": "", "`": "",
}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).lower()
    value = "".join(_SLUG_MAP.get(ch, ch) for ch in value)
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "item"


def is_safe_http_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(f"{settings.secret_key}:{ip}".encode()).hexdigest()[:32]


def naive_utc(value: datetime | None) -> datetime | None:
    """Convert an optional aware datetime to naive UTC for DB storage."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
