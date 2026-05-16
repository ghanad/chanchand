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
  brsapi_market:
    adapter: brsapi_market
products:
  chair:
    title: Chair
  usd:
    title: Dollar
targets:
  - product_key: chair
    source_key: digikala_api
    url: "https://www.digikala.com/product/dkp-1/"
    enabled: true
  - product_key: usd
    source_key: brsapi_market
    url: "https://api.brsapi.ir/Market/Gold_Currency.php"
    enabled: true
    adapter_settings:
      symbol: USD
""",
        encoding="utf-8",
    )


def seed_database(db_url: str) -> None:
    init_database(db_url)
    config = AppConfig(
        sources={"digikala_api": SourceConfig(adapter="digikala_api"), "brsapi_market": SourceConfig(adapter="brsapi_market")},
        products={"chair": ProductConfig(title="Chair"), "usd": ProductConfig(title="Dollar")},
        targets=[
            TargetConfig(
                product_key="chair",
                source_key="digikala_api",
                url="https://www.digikala.com/product/dkp-1/",
            ),
            TargetConfig(
                product_key="usd",
                source_key="brsapi_market",
                url="https://api.brsapi.ir/Market/Gold_Currency.php",
                adapter_settings={"symbol": "USD"},
            ),
        ],
    )
    chair_target = config.targets[0]
    usd_target = config.targets[1]
    with session_scope(db_url) as session:
        run = start_run(session, "config.yml", config)
        record_price(session, run.id, chair_target, PriceObservation(title="Chair", seller="Shop", price_irr=12000, availability="in_stock"))
        record_price(session, run.id, usd_target, PriceObservation(title="Dollar", seller="BRS API", price_irr=600000, availability="in_stock"))
        record_error(session, run.id, chair_target, RuntimeError("temporary failure"))
        finish_run(session, run.id, success_count=2, error_count=1)


def test_ui_serves_dashboard_and_json_endpoints(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    write_config(config_path)
    seed_database(db_url)
    client = TestClient(create_app(config_path=config_path, db_url=db_url))

    page = client.get("/")
    admin_page = client.get("/admin")
    admin_refresh = client.get("/admin/products")
    latest = client.get("/api/latest")
    products = client.get("/api/products")
    history = client.get("/api/history", params={"product_key": "chair"})
    runs = client.get("/api/runs")
    errors = client.get("/api/errors")
    font = client.get("/font-assets/Webfonts/fonts/woff2/IRANSansX-Regular.woff2")

    assert page.status_code == 200
    assert admin_page.status_code == 200
    assert admin_refresh.status_code == 200
    assert "Price Getter" in page.text
    assert "Price Getter" in admin_page.text
    assert "Price Getter" in admin_refresh.text
    assert "/assets/" in page.text
    assert font.status_code == 200
    assert latest.status_code == 200
    assert products.status_code == 200
    assert history.status_code == 200
    assert runs.status_code == 200
    assert errors.status_code == 200
    latest_chair = next(row for row in latest.json()["rows"] if row["product_key"] == "chair")
    assert latest_chair["price_toman"] == 1200
    assert products.json()["products"][0]["key"] == "chair"
    assert history.json()["rows"][0]["price_irr"] == 12000
    assert history.json()["rows"][0]["price_usd"] == 0.02
    assert history.json()["rows"][0]["usd_rate_toman"] == 60000
    assert history.json()["rows"][0]["url"] == "https://www.digikala.com/product/dkp-1/"
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


def test_ui_write_endpoints_are_not_public(tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    write_config(config_path)
    app = create_app(config_path=config_path, db_url=db_url)
    client = TestClient(app)
    payload = {"title": "New Phone", "url": "https://www.digikala.com/product/dkp-2/", "source_key": "digikala_api"}
    public_write_routes = {
        ("POST", "/run-now"),
        ("POST", "/config/products"),
        ("PUT", "/config/products/{product_key}"),
        ("DELETE", "/config/products/{product_key}"),
        ("POST", "/config/products/{product_key}/disable"),
        ("POST", "/config/products/{product_key}/enable"),
    }
    registered_routes = {
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", set())
    }

    assert public_write_routes.isdisjoint(registered_routes)
    assert client.post("/run-now").status_code in {404, 405}
    assert client.post("/config/products", json=payload).status_code in {404, 405}
    assert client.put("/config/products/chair", json=payload).status_code in {404, 405}
    assert client.delete("/config/products/chair").status_code in {404, 405}
    assert client.post("/config/products/chair/disable").status_code in {404, 405}
    assert client.post("/config/products/chair/enable").status_code in {404, 405}


def test_ui_admin_endpoints_can_edit_config_and_run_now(monkeypatch, tmp_path) -> None:
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
        "/admin/config/products",
        json={"title": "New Phone", "url": "https://www.digikala.com/product/dkp-2/", "source_key": "digikala_api"},
    )
    updated = client.put(
        "/admin/config/products/new-phone",
        json={"title": "Updated Phone", "url": "https://www.digikala.com/product/dkp-3/", "source_key": "digikala_api"},
    )
    config_after_update = load_config(config_path)
    disabled = client.post("/admin/config/products/new-phone/disable")
    enabled = client.post("/admin/config/products/new-phone/enable")
    deleted = client.delete("/admin/config/products/new-phone")
    run = client.post("/admin/run-now")
    config = load_config(config_path)

    assert added.status_code == 200
    assert added.json()["product_key"] == "new-phone"
    assert "backup_path" in added.json()
    assert updated.status_code == 200
    assert updated.json()["product_key"] == "new-phone"
    assert "backup_path" in updated.json()
    assert config_after_update.products["new-phone"].title == "Updated Phone"
    edited_target = next(target for target in config_after_update.targets if target.product_key == "new-phone")
    assert edited_target.url == "https://www.digikala.com/product/dkp-3/"
    assert disabled.status_code == 200
    assert disabled.json()["product_key"] == "new-phone"
    assert "backup_path" in disabled.json()
    assert enabled.status_code == 200
    assert enabled.json()["product_key"] == "new-phone"
    assert "backup_path" in enabled.json()
    assert deleted.status_code == 200
    assert deleted.json()["product_key"] == "new-phone"
    assert "backup_path" in deleted.json()
    assert "new-phone" not in config.products
    assert all(target.product_key != "new-phone" for target in config.targets)
    assert run.json()["run_id"] == 42
    assert run.json()["target_count"] == 1
    assert run.json()["success_count"] == 1
    assert run.json()["error_count"] == 0
    assert run.json()["status"] == "success"


def test_ui_datetime_serialization_treats_sqlite_naive_values_as_utc() -> None:
    assert _datetime(datetime(2026, 5, 9, 19, 27, 11)) == "2026-05-09T19:27:11+00:00"
    assert _datetime(datetime(2026, 5, 9, 19, 27, 11, tzinfo=UTC)) == "2026-05-09T19:27:11+00:00"
