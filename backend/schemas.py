"""Pydantic request/response schemas with input validation."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .constants import GENRES, is_permitted_media_path
from .utils import is_safe_http_url


def _clean_text(value: str | None, max_len: int | None = None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if max_len and len(value) > max_len:
        raise ValueError(f"Matn {max_len} belgidan oshmasligi kerak")
    return value


def _validate_image_ref(value: str | None) -> str | None:
    value = _clean_text(value, 512)
    if not value:
        return None
    if is_permitted_media_path(value) or is_safe_http_url(value):
        return value
    raise ValueError("Rasm manzili /uploads/... yoki http(s) URL bo'lishi kerak")


class TelegramLoginIn(BaseModel):
    init_data: str = Field(min_length=10, max_length=8192)
    language: str | None = None

    @field_validator("language")
    @classmethod
    def _lang(cls, value: str | None) -> str | None:
        if value not in {None, "uz", "uzc"}:
            raise ValueError("Til 'uz' yoki 'uzc' bo'lishi kerak")
        return value


class DevLoginIn(BaseModel):
    telegram_id: int = Field(gt=0)
    username: str | None = Field(default=None, max_length=64)
    first_name: str | None = Field(default="Dev User", max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    language: str = "uz"


class LanguageIn(BaseModel):
    language: Literal["uz", "uzc"]


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_id: int | None = None
    username: str | None
    first_name: str | None
    last_name: str | None
    photo_url: str | None
    language: str
    role: str
    is_blocked: bool
    vip_until: datetime | None
    is_vip: bool
    visit_count: int
    created_at: datetime
    last_seen_at: datetime


class LoginOut(BaseModel):
    token: str
    user: UserPublic


class ContentIn(BaseModel):
    kind: Literal["movie", "series"] = "movie"
    title: str = Field(min_length=1, max_length=200)
    title_cyrl: str | None = Field(default=None, max_length=200)
    original_title: str | None = Field(default=None, max_length=200)
    year: int = Field(ge=1888, le=2100)
    genres: list[str] = Field(default_factory=list)
    country: str | None = Field(default=None, max_length=80)
    age_rating: str | None = Field(default=None, max_length=16)
    description: str = Field(default="", max_length=6000)
    description_cyrl: str | None = Field(default=None, max_length=6000)
    poster_url: str | None = None
    backdrop_url: str | None = None
    trailer_url: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1200)
    video_source: str | None = None
    video_url: str | None = Field(default=None, max_length=1024)
    telegram_file_id: str | None = Field(default=None, max_length=512)
    is_featured: bool = False
    is_published: bool = False
    is_demo: bool = False
    license_note: str | None = Field(default=None, max_length=512)

    @field_validator("title", "title_cyrl", "original_title")
    @classmethod
    def _title(cls, value: str | None) -> str | None:
        return _clean_text(value, 200)

    @field_validator("genres")
    @classmethod
    def _genres(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for genre in value:
            if genre not in GENRES:
                raise ValueError(f"Noma'lum janr: {genre}")
            if genre not in cleaned:
                cleaned.append(genre)
        if len(cleaned) > 6:
            raise ValueError("Ko'pi bilan 6 ta janr tanlang")
        return cleaned

    @field_validator("poster_url", "backdrop_url")
    @classmethod
    def _images(cls, value: str | None) -> str | None:
        return _validate_image_ref(value)

    @field_validator("trailer_url", "video_url")
    @classmethod
    def _urls(cls, value: str | None) -> str | None:
        value = _clean_text(value, 1024)
        if value and not is_safe_http_url(value):
            raise ValueError("Faqat http(s) havolalar qabul qilinadi")
        return value or None

    @field_validator("video_source")
    @classmethod
    def _video_source(cls, value: str | None) -> str | None:
        if value in {None, ""}:
            return None
        if value not in {"url", "telegram"}:
            raise ValueError("video_source 'url' yoki 'telegram' bo'lishi kerak")
        return value

    @model_validator(mode="after")
    def _video_consistency(self):
        if self.video_source == "url" and not self.video_url:
            raise ValueError("URL video uchun video_url kiritilishi shart")
        if self.video_source == "telegram" and not self.telegram_file_id:
            raise ValueError("Telegram video uchun telegram_file_id kiritilishi shart")
        if self.video_source is None and (self.video_url or self.telegram_file_id):
            raise ValueError("Video manbasi turini tanlang")
        return self


class ContentUpdate(BaseModel):
    kind: Literal["movie", "series"] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    title_cyrl: str | None = Field(default=None, max_length=200)
    original_title: str | None = Field(default=None, max_length=200)
    year: int | None = Field(default=None, ge=1888, le=2100)
    genres: list[str] | None = None
    country: str | None = Field(default=None, max_length=80)
    age_rating: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=6000)
    description_cyrl: str | None = Field(default=None, max_length=6000)
    poster_url: str | None = None
    backdrop_url: str | None = None
    trailer_url: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1200)
    video_source: str | None = None
    video_url: str | None = Field(default=None, max_length=1024)
    telegram_file_id: str | None = Field(default=None, max_length=512)
    is_featured: bool | None = None
    is_published: bool | None = None
    is_demo: bool | None = None
    license_note: str | None = Field(default=None, max_length=512)

    @field_validator("title", "title_cyrl", "original_title")
    @classmethod
    def _title(cls, value: str | None) -> str | None:
        return _clean_text(value, 200)

    @field_validator("genres")
    @classmethod
    def _genres(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned: list[str] = []
        for genre in value:
            if genre not in GENRES:
                raise ValueError(f"Noma'lum janr: {genre}")
            if genre not in cleaned:
                cleaned.append(genre)
        if len(cleaned) > 6:
            raise ValueError("Ko'pi bilan 6 ta janr tanlang")
        return cleaned

    @field_validator("poster_url", "backdrop_url")
    @classmethod
    def _images(cls, value: str | None) -> str | None:
        return _validate_image_ref(value)

    @field_validator("trailer_url", "video_url")
    @classmethod
    def _urls(cls, value: str | None) -> str | None:
        value = _clean_text(value, 1024)
        if value and not is_safe_http_url(value):
            raise ValueError("Faqat http(s) havolalar qabul qilinadi")
        return value or None

    @field_validator("video_source")
    @classmethod
    def _video_source(cls, value: str | None) -> str | None:
        if value in {None, ""}:
            return None
        if value not in {"url", "telegram"}:
            raise ValueError("video_source 'url' yoki 'telegram' bo'lishi kerak")
        return value


class SeasonIn(BaseModel):
    number: int = Field(ge=1, le=100)
    title: str | None = Field(default=None, max_length=200)


class SeasonUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1, le=100)
    title: str | None = Field(default=None, max_length=200)


class EpisodeIn(BaseModel):
    number: int = Field(ge=1, le=1000)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    duration_minutes: int | None = Field(default=None, ge=1, le=1200)
    video_source: str | None = None
    video_url: str | None = Field(default=None, max_length=1024)
    telegram_file_id: str | None = Field(default=None, max_length=512)

    @field_validator("video_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        value = _clean_text(value, 1024)
        if value and not is_safe_http_url(value):
            raise ValueError("Faqat http(s) havolalar qabul qilinadi")
        return value or None

    @field_validator("video_source")
    @classmethod
    def _source(cls, value: str | None) -> str | None:
        if value in {None, ""}:
            return None
        if value not in {"url", "telegram"}:
            raise ValueError("Video manbasi noto'g'ri")
        return value

    @model_validator(mode="after")
    def _consistency(self):
        if self.video_source == "url" and not self.video_url:
            raise ValueError("video_url kiritilishi shart")
        if self.video_source == "telegram" and not self.telegram_file_id:
            raise ValueError("telegram_file_id kiritilishi shart")
        if self.video_source is None and (self.video_url or self.telegram_file_id):
            raise ValueError("Video manbasi turini tanlang")
        return self


class EpisodeUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1, le=1000)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    duration_minutes: int | None = Field(default=None, ge=1, le=1200)
    video_source: str | None = None
    video_url: str | None = Field(default=None, max_length=1024)
    telegram_file_id: str | None = Field(default=None, max_length=512)


class EpisodeReorderIn(BaseModel):
    episode_ids: list[int] = Field(min_length=1, max_length=500)


class AdIn(BaseModel):
    advertiser: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    image_url: str
    destination_url: str = Field(min_length=4, max_length=1024)
    placement: Literal["landing", "home_hero", "catalog_banner", "between_rows"]
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True
    is_demo: bool = False

    @field_validator("image_url")
    @classmethod
    def _image(cls, value: str) -> str:
        value = _validate_image_ref(value)
        if not value:
            raise ValueError("Reklama rasmi talab qilinadi")
        return value

    @field_validator("destination_url")
    @classmethod
    def _destination(cls, value: str) -> str:
        value = value.strip()
        if not is_safe_http_url(value):
            raise ValueError("Maqsad URL faqat http(s) bo'lishi kerak")
        return value

    @model_validator(mode="after")
    def _dates(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak")
        return self


class AdUpdate(BaseModel):
    advertiser: str | None = Field(default=None, min_length=1, max_length=160)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    image_url: str | None = None
    destination_url: str | None = Field(default=None, min_length=4, max_length=1024)
    placement: Literal["landing", "home_hero", "catalog_banner", "between_rows"] | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None
    is_demo: bool | None = None

    @field_validator("image_url")
    @classmethod
    def _image(cls, value: str | None) -> str | None:
        return _validate_image_ref(value)

    @field_validator("destination_url")
    @classmethod
    def _destination(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not is_safe_http_url(value):
            raise ValueError("Maqsad URL faqat http(s) bo'lishi kerak")
        return value


class UserAdminUpdate(BaseModel):
    is_blocked: bool | None = None
    vip_days: int | None = Field(default=None, ge=-3650, le=3650)
    language: Literal["uz", "uzc"] | None = None


class RoleUpdate(BaseModel):
    role: Literal["admin", "user"]


class SettingsUpdate(BaseModel):
    vip_enabled: bool | None = None
    site_notice: str | None = Field(default=None, max_length=500)


class VipPlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_cyrl: str | None = Field(default=None, max_length=120)
    days: int = Field(ge=1, le=3650)
    price: int = Field(ge=0, le=100_000_000)
    currency: str = Field(default="UZS", pattern="^[A-Z]{3}$")
    benefits: str | None = Field(default=None, max_length=1000)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=9999)


class BackupRestoreIn(BaseModel):
    confirm: str

    @field_validator("confirm")
    @classmethod
    def _confirm(cls, value: str) -> str:
        if value != "RESTORE":
            raise ValueError("Tasdiqlash uchun RESTORE deb yozing")
        return value


class PaymentWebhookIn(BaseModel):
    transaction_id: int
    status: Literal["paid", "failed"]
    provider_transaction_id: str = Field(min_length=1, max_length=255)
    amount: int | None = None
