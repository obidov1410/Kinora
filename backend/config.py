"""Application configuration, loaded strictly from environment variables."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR.parent / ".env", BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: str = "development"
    app_name: str = "Kinora API"
    bot_token: str = ""
    bot_username: str = "KinoraTV_bot"
    owner_id: int = 7041471070
    secret_key: str = ""

    database_url: str = ""
    data_dir: str = "data"
    uploads_dir: str = ""
    backups_dir: str = ""

    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500"
    frontend_url: str = "http://localhost:8000"

    allow_dev_login: bool = False
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 120
    session_ttl_hours: int = 168
    telegram_auth_max_age: int = 86400
    media_token_ttl_hours: int = 6
    max_upload_mb: int = 8
    backup_interval_hours: int = 0
    backup_retention: int = 10
    seed_demo: bool = True

    payment_provider: str = "none"
    payment_webhook_secret: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def default_database_url(cls, value: str) -> str:
        if value:
            return value
        return f"sqlite:///{(BASE_DIR / 'data' / 'kinora.db').as_posix()}"

    @field_validator("secret_key", mode="before")
    @classmethod
    def default_secret(cls, value: str) -> str:
        # A random key is generated per process so the app never ships a known
        # default. Sessions reset on restart; production must set SECRET_KEY.
        if value:
            return value
        return secrets.token_urlsafe(48)

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).expanduser().resolve() if self.data_dir else (BASE_DIR / "data")

    @property
    def uploads_path(self) -> Path:
        return Path(self.uploads_dir).expanduser().resolve() if self.uploads_dir else self.data_path / "uploads"

    @property
    def backups_path(self) -> Path:
        return Path(self.backups_dir).expanduser().resolve() if self.backups_dir else self.data_path / "backups"

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"production", "prod"}

    @property
    def dev_login_allowed(self) -> bool:
        return bool(self.allow_dev_login) and not self.is_production

    @property
    def telegram_configured(self) -> bool:
        return bool(self.bot_token) and ":" in self.bot_token

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def database_path(self) -> Path | None:
        """Return the SQLite file path, or None for non-SQLite databases."""
        if not self.database_url.startswith("sqlite:///"):
            return None
        raw = self.database_url[len("sqlite:///"):]
        if raw == ":memory:":
            return None
        path = Path(raw)
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        return path

    def ensure_dirs(self) -> None:
        self.data_path.mkdir(parents=True, exist_ok=True)
        self.uploads_path.mkdir(parents=True, exist_ok=True)
        self.backups_path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings


settings = get_settings()
