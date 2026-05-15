from price_getter.adapters.base import PriceObservation
from price_getter.config import AppConfig, ProductConfig, SourceConfig, TargetConfig
from price_getter.db import session_scope
from price_getter.repository import latest_snapshots
from price_getter.runner import PriceRunner


class FakeAdapter:
    name = "fake"
    fetch_count = 0

    def fetch(self, context):
        type(self).fetch_count += 1
        if "bad" in context.target.url:
            raise RuntimeError("bad target")
        if "missing-price" in context.target.url:
            return PriceObservation(title="Phone", price_irr=None, availability="out_of_stock")
        return PriceObservation(title="Phone", price_irr=2000, availability="in_stock")


def test_runner_continues_after_target_error(monkeypatch, tmp_path) -> None:
    FakeAdapter.fetch_count = 0
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html", rate_limit_seconds=0)},
        products={"phone": ProductConfig(title="Phone"), "laptop": ProductConfig(title="Laptop")},
        targets=[
            TargetConfig(product_key="phone", source_key="demo", url="https://example.com/ok"),
            TargetConfig(product_key="laptop", source_key="demo", url="https://example.com/bad"),
        ],
    )

    monkeypatch.setattr("price_getter.runner.get_adapter", lambda name: FakeAdapter())
    summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")

    assert summary.status == "partial"
    assert summary.success_count == 1
    assert summary.error_count == 1
    with session_scope(db_url) as session:
        assert latest_snapshots(session)[0].price_irr == 2000


def test_runner_skips_non_market_product_after_successful_price_today(monkeypatch, tmp_path) -> None:
    FakeAdapter.fetch_count = 0
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html", rate_limit_seconds=0)},
        products={"phone": ProductConfig(title="Phone")},
        targets=[TargetConfig(product_key="phone", source_key="demo", url="https://example.com/ok")],
    )

    monkeypatch.setattr("price_getter.runner.get_adapter", lambda name: FakeAdapter())

    first_summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")
    second_summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")

    assert first_summary.success_count == 1
    assert second_summary.success_count == 0
    assert second_summary.error_count == 0
    assert FakeAdapter.fetch_count == 1


def test_runner_rechecks_product_when_today_snapshot_has_no_price(monkeypatch, tmp_path) -> None:
    FakeAdapter.fetch_count = 0
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html", rate_limit_seconds=0)},
        products={"phone": ProductConfig(title="Phone")},
        targets=[TargetConfig(product_key="phone", source_key="demo", url="https://example.com/missing-price")],
    )

    monkeypatch.setattr("price_getter.runner.get_adapter", lambda name: FakeAdapter())

    PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")
    second_summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")

    assert second_summary.success_count == 1
    assert FakeAdapter.fetch_count == 2


def test_runner_does_not_skip_brsapi_market_after_successful_price_today(monkeypatch, tmp_path) -> None:
    FakeAdapter.fetch_count = 0
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config = AppConfig(
        sources={"market": SourceConfig(adapter="brsapi_market", rate_limit_seconds=0)},
        products={"usd": ProductConfig(title="USD")},
        targets=[TargetConfig(product_key="usd", source_key="market", url="https://api.brsapi.ir/Api/Market/Gold_Currency.php")],
    )

    monkeypatch.setattr("price_getter.runner.get_adapter", lambda name: FakeAdapter())

    PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")
    second_summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")

    assert second_summary.success_count == 1
    assert FakeAdapter.fetch_count == 2
