from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from price_getter.adapters.base import PriceObservation
from price_getter.config import AppConfig, TargetConfig
from price_getter.models import FetchError, PriceSnapshot, ProductSnapshot, ProductTargetSnapshot, Run, SourceSnapshot


def start_run(session: Session, config_path: str | None, config: AppConfig) -> Run:
    run = Run(config_path=config_path, target_count=len(config.active_targets()))
    session.add(run)
    session.flush()

    for key, source in config.sources.items():
        session.add(
            SourceSnapshot(
                run_id=run.id,
                key=key,
                adapter=source.adapter,
                config_json=source.model_dump(mode="json"),
            )
        )
    for key, product in config.products.items():
        session.add(
            ProductSnapshot(
                run_id=run.id,
                key=key,
                title=product.title,
                config_json=product.model_dump(mode="json"),
            )
        )
    for target in config.targets:
        session.add(
            ProductTargetSnapshot(
                run_id=run.id,
                product_key=target.product_key,
                source_key=target.source_key,
                url=target.url,
                enabled=target.enabled,
                config_json=target.model_dump(mode="json"),
            )
        )
    session.commit()
    return run


def finish_run(session: Session, run_id: int, success_count: int, error_count: int) -> Run:
    run = session.get_one(Run, run_id)
    run.success_count = success_count
    run.error_count = error_count
    run.finished_at = datetime.now(timezone.utc)
    if error_count == 0:
        run.status = "success"
    elif success_count == 0 and run.target_count > 0:
        run.status = "failed"
    else:
        run.status = "partial"
    session.commit()
    return run


def record_price(session: Session, run_id: int, target: TargetConfig, observation: PriceObservation) -> PriceSnapshot:
    snapshot = PriceSnapshot(
        run_id=run_id,
        product_key=target.product_key,
        source_key=target.source_key,
        url=target.url,
        title=observation.title,
        seller=observation.seller,
        price_irr=observation.price_irr,
        availability=observation.availability,
        raw_observation=observation.raw_observation,
    )
    session.add(snapshot)
    session.commit()
    return snapshot


def record_error(
    session: Session,
    run_id: int,
    target: TargetConfig,
    exc: BaseException,
    *,
    raw_observation: dict[str, Any] | None = None,
) -> FetchError:
    error = FetchError(
        run_id=run_id,
        product_key=target.product_key,
        source_key=target.source_key,
        url=target.url,
        error_type=type(exc).__name__,
        message=str(exc),
        raw_observation=raw_observation or {},
    )
    session.add(error)
    session.commit()
    return error


def has_successful_price_today(session: Session, product_key: str, *, now: datetime | None = None) -> bool:
    now = now or datetime.now().astimezone()
    if now.tzinfo is None:
        now = now.astimezone()
    start_of_day = datetime.combine(now.date(), time.min, tzinfo=now.tzinfo)
    end_of_day = datetime.combine(now.date(), time.max, tzinfo=now.tzinfo)
    start_utc = start_of_day.astimezone(timezone.utc)
    end_utc = end_of_day.astimezone(timezone.utc)

    statement = (
        select(PriceSnapshot.id)
        .where(PriceSnapshot.product_key == product_key)
        .where(PriceSnapshot.price_irr.is_not(None))
        .where(PriceSnapshot.observed_at >= start_utc)
        .where(PriceSnapshot.observed_at <= end_utc)
        .limit(1)
    )
    return session.scalars(statement).first() is not None


def latest_snapshots(session: Session, *, limit: int = 100) -> list[PriceSnapshot]:
    rows = session.scalars(select(PriceSnapshot).order_by(PriceSnapshot.observed_at.desc(), PriceSnapshot.id.desc())).all()
    seen: set[tuple[str, str]] = set()
    latest: list[PriceSnapshot] = []
    for row in rows:
        key = (row.product_key, row.source_key)
        if key in seen:
            continue
        seen.add(key)
        latest.append(row)
        if len(latest) >= limit:
            break
    return latest


def product_history_chronological(
    session: Session,
    product_key: str,
    *,
    source_key: str | None = None,
    limit: int = 200,
) -> list[PriceSnapshot]:
    rows = product_history(session, product_key, source_key=source_key, limit=limit)
    return list(reversed(rows))


def product_history(
    session: Session,
    product_key: str,
    *,
    source_key: str | None = None,
    limit: int = 50,
) -> list[PriceSnapshot]:
    statement = select(PriceSnapshot).where(PriceSnapshot.product_key == product_key)
    if source_key:
        statement = statement.where(PriceSnapshot.source_key == source_key)
    statement = statement.order_by(PriceSnapshot.observed_at.desc(), PriceSnapshot.id.desc()).limit(limit)
    return list(session.scalars(statement))


def recent_errors(session: Session, *, limit: int = 50) -> list[FetchError]:
    statement = select(FetchError).order_by(FetchError.observed_at.desc(), FetchError.id.desc()).limit(limit)
    return list(session.scalars(statement))


def recent_runs(session: Session, *, limit: int = 20) -> list[Run]:
    statement = select(Run).order_by(Run.started_at.desc(), Run.id.desc()).limit(limit)
    return list(session.scalars(statement))


def latest_run(session: Session) -> Run | None:
    return session.scalars(select(Run).order_by(Run.started_at.desc(), Run.id.desc()).limit(1)).first()


def products_from_latest_run(session: Session) -> list[ProductSnapshot]:
    run = latest_run(session)
    if run is None:
        return []
    statement = select(ProductSnapshot).where(ProductSnapshot.run_id == run.id).order_by(ProductSnapshot.key)
    return list(session.scalars(statement))


def sources_from_latest_run(session: Session) -> list[SourceSnapshot]:
    run = latest_run(session)
    if run is None:
        return []
    statement = select(SourceSnapshot).where(SourceSnapshot.run_id == run.id).order_by(SourceSnapshot.key)
    return list(session.scalars(statement))
