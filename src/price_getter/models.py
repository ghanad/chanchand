from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="running", nullable=False)
    config_path: Mapped[str | None] = mapped_column(Text)
    target_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    price_snapshots: Mapped[list["PriceSnapshot"]] = relationship(back_populates="run")
    fetch_errors: Mapped[list["FetchError"]] = relationship(back_populates="run")


class SourceSnapshot(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    adapter: Mapped[str] = mapped_column(String(64), nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class ProductSnapshot(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class ProductTargetSnapshot(Base):
    __tablename__ = "product_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True, nullable=False)
    product_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    source_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(nullable=False)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True, nullable=False)
    product_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    source_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    seller: Mapped[str | None] = mapped_column(Text)
    price_irr: Mapped[int | None] = mapped_column(Integer)
    availability: Mapped[str] = mapped_column(String(32), default="unknown", nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    raw_observation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    run: Mapped[Run] = relationship(back_populates="price_snapshots")


class FetchError(Base):
    __tablename__ = "fetch_errors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), index=True, nullable=False)
    product_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    source_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    error_type: Mapped[str] = mapped_column(String(128), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    raw_observation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    run: Mapped[Run] = relationship(back_populates="fetch_errors")
