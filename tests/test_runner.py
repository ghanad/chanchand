from price_getter.adapters.base import PriceObservation
from price_getter.config import AppConfig, ProductConfig, SourceConfig, TargetConfig
from price_getter.db import session_scope
from price_getter.repository import latest_snapshots
from price_getter.runner import PriceRunner


class FakeAdapter:
    name = "fake"

    def fetch(self, context):
        if "bad" in context.target.url:
            raise RuntimeError("bad target")
        return PriceObservation(title="Phone", price_irr=2000, availability="in_stock")


def test_runner_continues_after_target_error(monkeypatch, tmp_path) -> None:
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html", rate_limit_seconds=0)},
        products={"phone": ProductConfig(title="Phone")},
        targets=[
            TargetConfig(product_key="phone", source_key="demo", url="https://example.com/ok"),
            TargetConfig(product_key="phone", source_key="demo", url="https://example.com/bad"),
        ],
    )

    monkeypatch.setattr("price_getter.runner.get_adapter", lambda name: FakeAdapter())
    summary = PriceRunner(db_url=db_url, sleep_func=lambda seconds: None).run(config, config_path="inline")

    assert summary.status == "partial"
    assert summary.success_count == 1
    assert summary.error_count == 1
    with session_scope(db_url) as session:
        assert latest_snapshots(session)[0].price_irr == 2000
