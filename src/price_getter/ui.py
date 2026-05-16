from __future__ import annotations

import threading
import webbrowser
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from price_getter.config import AppConfig, ConfigLoadError, load_config
from price_getter.config_editor import (
    ConfigEditError,
    add_product_target,
    delete_product,
    disable_product,
    enable_product,
    update_product_target,
)
from price_getter.db import init_database, session_scope
from price_getter.models import FetchError, PriceSnapshot, ProductSnapshot, Run, SourceSnapshot
from price_getter.repository import (
    latest_snapshots,
    product_history_chronological,
    products_from_latest_run,
    recent_errors,
    recent_runs,
    sources_from_latest_run,
)
from price_getter.runtime import runtime_config_path, runtime_db_url, runtime_host, runtime_port
from price_getter.runner import PriceRunner

USD_PRODUCT_KEY = "usd"
USD_HISTORY_LIMIT = 10000


class AddProductRequest(BaseModel):
    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    source_key: str | None = None


class UpdateProductRequest(BaseModel):
    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    source_key: str | None = None


def create_app(
    *,
    config_path: str | Path | None = None,
    db_url: str | None = None,
) -> FastAPI:
    config_path = runtime_config_path(config_path)
    db_url = runtime_db_url(db_url)
    package_dir = Path(__file__).parent
    ui_dist_dir = package_dir / "ui_dist"
    ui_assets_dir = ui_dist_dir / "assets"
    ui_index = ui_dist_dir / "index.html"

    app = FastAPI(title="Price Getter UI")
    app.state.config_path = config_path
    app.state.db_url = db_url
    if ui_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(ui_assets_dir)), name="ui-assets")
    font_dir = package_dir.parents[1] / "IranSansX"
    if font_dir.exists():
        app.mount("/font-assets", StaticFiles(directory=str(font_dir)), name="font-assets")
    api_router = APIRouter(prefix="/api", tags=["public"])
    admin_router = APIRouter(prefix="/admin", tags=["admin"])

    @app.get("/", response_class=HTMLResponse)
    def index() -> FileResponse:
        return _ui_index_response(ui_index)

    @app.get("/admin", response_class=HTMLResponse)
    def admin_index() -> FileResponse:
        return _ui_index_response(ui_index)

    @api_router.get("/latest")
    def api_latest() -> dict[str, Any]:
        config = _load_config_or_400(config_path)
        init_database(db_url)
        with session_scope(db_url) as session:
            rows = latest_snapshots(session)
            runs = recent_runs(session, limit=1)
            products = _products_payload(config, products_from_latest_run(session))
        latest_run = _serialize_run(runs[0]) if runs else None
        latest_observed_at = max((row.observed_at for row in rows), default=None)
        return {
            "summary": {
                "product_count": len(products),
                "latest_run": latest_run,
                "latest_observed_at": _datetime(latest_observed_at),
            },
            "rows": [_serialize_price(row) for row in rows],
        }

    @api_router.get("/products")
    def api_products() -> dict[str, Any]:
        config = _load_config_or_400(config_path)
        init_database(db_url)
        with session_scope(db_url) as session:
            db_products = products_from_latest_run(session)
            db_sources = sources_from_latest_run(session)
        return {
            "products": _products_payload(config, db_products),
            "sources": _sources_payload(config, db_sources),
        }

    @api_router.get("/history")
    def api_history(
        product_key: str = Query(min_length=1),
        source_key: str | None = None,
        limit: int = Query(default=200, ge=1, le=1000),
    ) -> dict[str, Any]:
        init_database(db_url)
        with session_scope(db_url) as session:
            rows = product_history_chronological(session, product_key, source_key=source_key, limit=limit)
            usd_rows = product_history_chronological(session, USD_PRODUCT_KEY, limit=USD_HISTORY_LIMIT)
        return {"rows": _serialize_history_prices(rows, usd_rows)}

    @api_router.get("/runs")
    def api_runs(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
        init_database(db_url)
        with session_scope(db_url) as session:
            rows = recent_runs(session, limit=limit)
        return {"rows": [_serialize_run(row) for row in rows]}

    @api_router.get("/errors")
    def api_errors(limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
        init_database(db_url)
        with session_scope(db_url) as session:
            rows = recent_errors(session, limit=limit)
        return {"rows": [_serialize_error(row) for row in rows]}

    @admin_router.post("/run-now")
    def run_now() -> dict[str, Any]:
        try:
            summary = PriceRunner(db_url=db_url).run_config_file(config_path)
        except ConfigLoadError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "run_id": summary.run_id,
            "target_count": summary.target_count,
            "success_count": summary.success_count,
            "error_count": summary.error_count,
            "status": summary.status,
        }

    @admin_router.post("/config/products")
    def add_product(payload: AddProductRequest) -> dict[str, Any]:
        try:
            result = add_product_target(
                config_path,
                title=payload.title,
                url=payload.url,
                source_key=payload.source_key,
            )
        except ConfigEditError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"product_key": result.product_key, "backup_path": str(result.backup_path)}

    @admin_router.put("/config/products/{product_key}")
    def update_product(product_key: str, payload: UpdateProductRequest) -> dict[str, Any]:
        try:
            result = update_product_target(
                config_path,
                product_key,
                title=payload.title,
                url=payload.url,
                source_key=payload.source_key,
            )
        except ConfigEditError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"product_key": result.product_key, "backup_path": str(result.backup_path)}

    @admin_router.delete("/config/products/{product_key}")
    def delete_product_endpoint(product_key: str) -> dict[str, Any]:
        try:
            result = delete_product(config_path, product_key)
        except ConfigEditError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"product_key": result.product_key, "backup_path": str(result.backup_path)}

    @admin_router.post("/config/products/{product_key}/disable")
    def disable_product_endpoint(product_key: str) -> dict[str, Any]:
        try:
            result = disable_product(config_path, product_key)
        except ConfigEditError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"product_key": result.product_key, "backup_path": str(result.backup_path)}

    @admin_router.post("/config/products/{product_key}/enable")
    def enable_product_endpoint(product_key: str) -> dict[str, Any]:
        try:
            result = enable_product(config_path, product_key)
        except ConfigEditError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"product_key": result.product_key, "backup_path": str(result.backup_path)}

    app.include_router(api_router)
    app.include_router(admin_router)

    @app.get("/{path:path}", response_class=HTMLResponse)
    def spa_fallback(path: str) -> FileResponse:
        if path.startswith(("api/", "assets/", "font-assets/", "config/")) or path == "run-now":
            raise HTTPException(status_code=404, detail="Not found")
        return _ui_index_response(ui_index)

    return app


def run_ui(
    *,
    config_path: str | Path | None = None,
    db_url: str | None = None,
    host: str | None = None,
    port: int | str | None = None,
    open_browser: bool = True,
) -> None:
    import uvicorn

    host = runtime_host(host)
    port = runtime_port(port)
    app = create_app(config_path=config_path, db_url=db_url)
    url = f"http://{host}:{port}"
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open_new_tab(url)).start()
    uvicorn.run(app, host=host, port=port)


def _load_config_or_400(path: Path) -> AppConfig:
    try:
        return load_config(path)
    except ConfigLoadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _ui_index_response(ui_index: Path) -> FileResponse:
    if not ui_index.exists():
        raise HTTPException(
            status_code=500,
            detail="UI build is missing. Run `npm install` and `npm run build` from the frontend directory.",
        )
    return FileResponse(ui_index)


def _products_payload(config: AppConfig, db_products: list[ProductSnapshot]) -> list[dict[str, Any]]:
    products: dict[str, dict[str, Any]] = {
        key: {
            "key": key,
            "title": product.title,
            "configured": True,
            "target_count": 0,
            "enabled_target_count": 0,
            "sources": [],
            "primary_target": None,
        }
        for key, product in config.products.items()
    }

    for target in config.targets:
        product = products.setdefault(
            target.product_key,
            {
                "key": target.product_key,
                "title": target.product_key,
                "configured": False,
                "target_count": 0,
                "enabled_target_count": 0,
                "sources": [],
                "primary_target": None,
            },
        )
        product["target_count"] += 1
        if target.enabled:
            product["enabled_target_count"] += 1
        if target.source_key not in product["sources"]:
            product["sources"].append(target.source_key)
        if product["primary_target"] is None:
            product["primary_target"] = {
                "source_key": target.source_key,
                "url": target.url,
                "enabled": target.enabled,
            }

    for db_product in db_products:
        products.setdefault(
            db_product.key,
            {
                "key": db_product.key,
                "title": db_product.title,
                "configured": False,
                "target_count": 0,
                "enabled_target_count": 0,
                "sources": [],
                "primary_target": None,
            },
        )

    return sorted(products.values(), key=lambda item: item["key"])


def _sources_payload(config: AppConfig, db_sources: list[SourceSnapshot]) -> list[dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {
        key: {
            "key": key,
            "adapter": source.adapter,
            "configured": True,
        }
        for key, source in config.sources.items()
    }
    for db_source in db_sources:
        sources.setdefault(
            db_source.key,
            {
                "key": db_source.key,
                "adapter": db_source.adapter,
                "configured": False,
            },
        )
    return sorted(sources.values(), key=lambda item: item["key"])


def _serialize_history_prices(rows: list[PriceSnapshot], usd_rows: list[PriceSnapshot]) -> list[dict[str, Any]]:
    usd_rates = [row for row in usd_rows if row.price_irr and row.price_irr > 0 and row.observed_at]
    return [_serialize_price(row, usd_rate_irr=_usd_rate_for(row, usd_rates)) for row in rows]


def _usd_rate_for(row: PriceSnapshot, usd_rates: list[PriceSnapshot]) -> int | None:
    if not usd_rates or row.observed_at is None:
        return None

    observed_at = _utc_timestamp(row.observed_at)
    latest_before: PriceSnapshot | None = None
    first_after: PriceSnapshot | None = None
    for usd_rate in usd_rates:
        if usd_rate.observed_at is None:
            continue
        usd_observed_at = _utc_timestamp(usd_rate.observed_at)
        if usd_observed_at <= observed_at:
            latest_before = usd_rate
            continue
        first_after = usd_rate
        break

    selected = latest_before or first_after
    return selected.price_irr if selected else None


def _serialize_price(row: PriceSnapshot, *, usd_rate_irr: int | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "run_id": row.run_id,
        "product_key": row.product_key,
        "source_key": row.source_key,
        "url": row.url,
        "title": row.title,
        "seller": row.seller,
        "price_irr": row.price_irr,
        "price_toman": _price_toman(row.price_irr),
        "price_usd": _price_usd(row.price_irr, usd_rate_irr),
        "usd_rate_irr": usd_rate_irr,
        "usd_rate_toman": _price_toman(usd_rate_irr),
        "availability": row.availability,
        "observed_at": _datetime(row.observed_at),
    }


def _serialize_error(row: FetchError) -> dict[str, Any]:
    return {
        "id": row.id,
        "run_id": row.run_id,
        "product_key": row.product_key,
        "source_key": row.source_key,
        "url": row.url,
        "error_type": row.error_type,
        "message": row.message,
        "observed_at": _datetime(row.observed_at),
    }


def _serialize_run(row: Run) -> dict[str, Any]:
    return {
        "id": row.id,
        "started_at": _datetime(row.started_at),
        "finished_at": _datetime(row.finished_at),
        "status": row.status,
        "config_path": row.config_path,
        "target_count": row.target_count,
        "success_count": row.success_count,
        "error_count": row.error_count,
    }


def _datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _utc_timestamp(value: datetime) -> float:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.timestamp()


def _price_toman(price_irr: int | None) -> int | float | None:
    if price_irr is None:
        return None
    if price_irr % 10 == 0:
        return price_irr // 10
    return round(price_irr / 10, 1)


def _price_usd(price_irr: int | None, usd_rate_irr: int | None) -> float | None:
    if price_irr is None or usd_rate_irr is None or usd_rate_irr <= 0:
        return None
    return round(price_irr / usd_rate_irr, 2)
