"""SQLAlchemy ORM models for Kinora."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .utils import now_utc


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    first_name: Mapped[str | None] = mapped_column(String(128))
    last_name: Mapped[str | None] = mapped_column(String(128))
    photo_url: Mapped[str | None] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(8), default="uz")
    role: Mapped[str] = mapped_column(String(16), default="user", index=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    vip_until: Mapped[datetime | None] = mapped_column(DateTime)
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)

    favorites: Mapped[list["Favorite"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True, default="movie")  # movie | series
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    title_cyrl: Mapped[str | None] = mapped_column(String(200))
    original_title: Mapped[str | None] = mapped_column(String(200))
    year: Mapped[int] = mapped_column(Integer, index=True)
    genres: Mapped[list] = mapped_column(JSON, default=list)
    country: Mapped[str | None] = mapped_column(String(80))
    age_rating: Mapped[str | None] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(Text, default="")
    description_cyrl: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(512))
    backdrop_url: Mapped[str | None] = mapped_column(String(512))
    trailer_url: Mapped[str | None] = mapped_column(String(512))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    video_source: Mapped[str | None] = mapped_column(String(16))  # url | telegram
    video_url: Mapped[str | None] = mapped_column(String(1024))
    telegram_file_id: Mapped[str | None] = mapped_column(String(512))
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    license_note: Mapped[str | None] = mapped_column(String(512))
    views_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    seasons: Mapped[list["Season"]] = relationship(
        back_populates="content", cascade="all, delete-orphan", order_by="Season.number"
    )
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="content", cascade="all, delete-orphan")


class Season(Base):
    __tablename__ = "seasons"
    __table_args__ = (UniqueConstraint("content_id", "number", name="uq_season_content_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    content: Mapped["Content"] = relationship(back_populates="seasons")
    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="season", cascade="all, delete-orphan", order_by="Episode.number"
    )


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("season_id", "number", name="uq_episode_season_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    video_source: Mapped[str | None] = mapped_column(String(16))
    video_url: Mapped[str | None] = mapped_column(String(1024))
    telegram_file_id: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    season: Mapped["Season"] = relationship(back_populates="episodes")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "content_id", name="uq_favorite_user_content"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    user: Mapped["User"] = relationship(back_populates="favorites")
    content: Mapped["Content"] = relationship(back_populates="favorites")


class ViewEvent(Base):
    __tablename__ = "view_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)


class Ad(Base):
    __tablename__ = "ads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    advertiser: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(String(512))
    destination_url: Mapped[str] = mapped_column(String(1024))
    placement: Mapped[str] = mapped_column(String(32), index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)


class AdEvent(Base):
    __tablename__ = "ad_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ad_id: Mapped[int] = mapped_column(ForeignKey("ads.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(16), index=True)  # impression | click
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)


class VipPlan(Base):
    __tablename__ = "vip_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    name_cyrl: Mapped[str | None] = mapped_column(String(120))
    days: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)  # whole currency units, e.g. 29000 UZS
    currency: Mapped[str] = mapped_column(String(8), default="UZS")
    benefits: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("vip_plans.id", ondelete="SET NULL"))
    provider: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="UZS")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    actor_telegram_id: Mapped[int | None] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(80))
    details: Mapped[dict | None] = mapped_column(JSON)
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)


Index("ix_contents_kind_published", Content.kind, Content.is_published)
Index("ix_views_content_created", ViewEvent.content_id, ViewEvent.created_at)
Index("ix_ads_placement_active", Ad.placement, Ad.is_active)
