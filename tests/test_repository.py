from price_getter.adapters.base import PriceObservation
from price_getter.config import AppConfig, ProductConfig, SourceConfig, TargetConfig
from price_getter.db import init_database, session_scope
from price_getter.repository import (
    finish_run,
    latest_snapshots,
    product_history,
    product_history_chronological,
    products_from_latest_run,
    recent_errors,
    recent_runs,
    record_error,
    record_price,
    sources_from_latest_run,
    start_run,
)


def test_repository_records_run_snapshot_and_error(tmp_path) -> None:
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    init_database(db_url)
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html")},
        products={"phone": ProductConfig(title="Phone")},
        targets=[TargetConfig(product_key="phone", source_key="demo", url="https://example.com/phone")],
    )
    target = config.targets[0]

    with session_scope(db_url) as session:
        run = start_run(session, "config.yml", config)
        record_price(
            session,
            run.id,
            target,
            PriceObservation(title="Phone", seller="Seller", price_irr=1000, availability="in_stock"),
        )
        record_price(
            session,
            run.id,
            target,
            PriceObservation(title="Phone", seller="Seller", price_irr=1500, availability="in_stock"),
        )
        record_error(session, run.id, target, RuntimeError("temporary failure"))
        finished = finish_run(session, run.id, success_count=1, error_count=1)

    with session_scope(db_url) as session:
        latest = latest_snapshots(session)
        history = product_history(session, "phone")
        chart_history = product_history_chronological(session, "phone")
        errors = recent_errors(session)
        runs = recent_runs(session)
        products = products_from_latest_run(session)
        sources = sources_from_latest_run(session)

    assert finished.status == "partial"
    assert latest[0].price_irr == 1500
    assert history[0].product_key == "phone"
    assert [row.price_irr for row in chart_history] == [1000, 1500]
    assert errors[0].message == "temporary failure"
    assert runs[0].id == finished.id
    assert products[0].key == "phone"
    assert sources[0].key == "demo"
