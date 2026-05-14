from datetime import UTC, datetime

from fastapi.testclient import TestClient

from price_getter.adapters.base import PriceObservation
from price_getter.config import AppConfig, ProductConfig, SourceConfig, TargetConfig, load_config
from price_getter.db import init_database, session_scope
from price_getter.repository import finish_run, record_error, record_price, start_run
from price_getter.runner import RunSummary
from price_getter.ui import _datetime, create_app


def write_config(path) -> None:
    path.write_text(
        """
sources:
  digikala_api:
    adapter: digikala_api
products:
  chair:
    title: Chair
targets:
  - product_key: chair
    source_key: digikala_api
    url: "https://www.digikala.com/product/dkp-1/"
    enabled: true
""",
        encoding="utf-8",
    )


def seed_database(db_url: str) -> None:
    init_database(db_url)
    config = AppConfig(
        sources={"digikala_api": SourceConfig(adapter="digikala_api")},
        products={"chair": ProductConfig(title="Chair")},
        targets=[
            TargetConfig(
                product_key="chair",
                source_key="digikala_api",
                url="https://www.digikala.com/product/dkp-1/",
            )
        ],
    )
    target = config.targets[0]
    with session_scope(db_url) as session:
        run = start_run(session, "config.yml", config)
        record_price(session, run.id, target, PriceObservation(title="Chair", seller="Shop", price_irr=12000, availability="in_stock"))
        record_error(session, run.id, target, RuntimeError("temporary failure"))
        finish_run(session, run.id, success_count=1, error_count=1)


def test_ui_serves_dashboard_and_json_endpoints(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    write_config(config_path)
    seed_database(db_url)
    client = TestClient(create_app(config_path=config_path, db_url=db_url))

    page = client.get("/")
    latest = client.get("/api/latest")
    products = client.get("/api/products")
    history = client.get("/api/history", params={"product_key": "chair"})
    runs = client.get("/api/runs")
    errors = client.get("/api/errors")
    font = client.get("/font-assets/Webfonts/fonts/woff2/IRANSansX-Regular.woff2")

    assert page.status_code == 200
    assert "Price Getter" in page.text
    assert "/assets/" in page.text
    assert font.status_code == 200
    assert latest.json()["rows"][0]["price_toman"] == 1200
    assert products.json()["products"][0]["key"] == "chair"
    assert history.json()["rows"][0]["price_irr"] == 12000
    assert runs.json()["rows"][0]["status"] == "partial"
    assert errors.json()["rows"][0]["message"] == "temporary failure"


def test_ui_serves_built_frontend_assets(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    write_config(config_path)
    client = TestClient(create_app(config_path=config_path, db_url=db_url))

    page = client.get("/")
    asset_path = page.text.split('src="', 1)[1].split('"', 1)[0]
    asset = client.get(asset_path)

    assert asset.status_code == 200
    assert "Price Getter" in page.text


def test_ui_can_edit_config_and_run_now(monkeypatch, tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    write_config(config_path)
    client = TestClient(create_app(config_path=config_path, db_url=db_url))

    class FakeRunner:
        def __init__(self, db_url: str) -> None:
            self.db_url = db_url

        def run_config_file(self, config_path):
            return RunSummary(run_id=42, target_count=1, success_count=1, error_count=0, status="success")

    monkeypatch.setattr("price_getter.ui.PriceRunner", FakeRunner)

    added = client.post(
        "/config/products",
        json={"title": "New Phone", "url": "https://www.digikala.com/product/dkp-2/", "source_key": "digikala_api"},
    )
    disabled = client.post("/config/products/new-phone/disable")
    enabled = client.post("/config/products/new-phone/enable")
    run = client.post("/run-now")
    config = load_config(config_path)

    assert added.status_code == 200
    assert added.json()["product_key"] == "new-phone"
    assert disabled.status_code == 200
    assert enabled.status_code == 200
    assert config.products["new-phone"].title == "New Phone"
    assert next(target for target in config.targets if target.product_key == "new-phone").enabled is True
    assert run.json()["run_id"] == 42


def test_ui_datetime_serialization_treats_sqlite_naive_values_as_utc() -> None:
    assert _datetime(datetime(2026, 5, 9, 19, 27, 11)) == "2026-05-09T19:27:11+00:00"
    assert _datetime(datetime(2026, 5, 9, 19, 27, 11, tzinfo=UTC)) == "2026-05-09T19:27:11+00:00"
