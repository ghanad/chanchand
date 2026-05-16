from typer.testing import CliRunner

from price_getter.adapters.base import PriceObservation
from price_getter.cli import app
from price_getter.config import AppConfig, ProductConfig, SourceConfig, TargetConfig
from price_getter.db import init_database, session_scope
from price_getter.repository import record_error, record_price, start_run

runner = CliRunner()


def test_cli_init_db_and_validate_config(tmp_path) -> None:
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    config_path = tmp_path / "config.yml"
    config_path.write_text(
        """
sources:
  demo:
    adapter: generic_html
    settings:
      selectors:
        price: ".price"
products:
  phone:
    title: Phone
targets:
  - product_key: phone
    source_key: demo
    url: "https://example.com/phone"
    enabled: false
""",
        encoding="utf-8",
    )

    init_result = runner.invoke(app, ["init-db", "--db-url", db_url])
    validate_result = runner.invoke(app, ["validate-config", "--config", str(config_path)])

    assert init_result.exit_code == 0
    assert validate_result.exit_code == 0
    assert "0/1 active targets" in validate_result.output


def test_cli_uses_runtime_env_defaults(monkeypatch, tmp_path) -> None:
    db_url = f"sqlite:///{tmp_path / 'env-prices.db'}"
    config_path = tmp_path / "env-config.yml"
    config_path.write_text(
        """
sources:
  demo:
    adapter: generic_html
products:
  phone:
    title: Phone
targets: []
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("PRICE_GETTER_CONFIG", str(config_path))
    monkeypatch.setenv("PRICE_GETTER_DB_URL", db_url)

    init_result = runner.invoke(app, ["init-db"])
    validate_result = runner.invoke(app, ["validate-config"])

    assert init_result.exit_code == 0
    assert f"Database initialized: {db_url}" in init_result.output
    assert validate_result.exit_code == 0
    assert "0/0 active targets" in validate_result.output


def test_cli_reports_latest_history_and_errors(tmp_path) -> None:
    db_url = f"sqlite:///{tmp_path / 'prices.db'}"
    init_database(db_url)
    config = AppConfig(
        sources={"demo": SourceConfig(adapter="generic_html")},
        products={"phone": ProductConfig(title="Phone")},
        targets=[TargetConfig(product_key="phone", source_key="demo", url="https://example.com/phone")],
    )
    target = config.targets[0]
    with session_scope(db_url) as session:
        run = start_run(session, "inline", config)
        record_price(session, run.id, target, PriceObservation(price_irr=5000, availability="in_stock"))
        record_error(session, run.id, target, RuntimeError("parse failed"))

    latest_result = runner.invoke(app, ["latest", "--db-url", db_url])
    history_result = runner.invoke(app, ["history", "phone", "--db-url", db_url])
    errors_result = runner.invoke(app, ["errors", "--db-url", db_url])

    assert latest_result.exit_code == 0
    assert "price_toman" in latest_result.output
    assert "500" in latest_result.output
    assert "5000" in latest_result.output
    assert history_result.exit_code == 0
    assert "price_toman" in history_result.output
    assert "phone" in history_result.output
    assert errors_result.exit_code == 0
    assert "parse failed" in errors_result.output


def test_cli_run_uses_runner(monkeypatch, tmp_path) -> None:
    config_path = tmp_path / "config.yml"
    config_path.write_text(
        """
sources:
  demo:
    adapter: generic_html
products:
  phone:
    title: Phone
targets: []
""",
        encoding="utf-8",
    )

    result = runner.invoke(app, ["run", "--config", str(config_path), "--db-url", f"sqlite:///{tmp_path / 'prices.db'}"])

    assert result.exit_code == 0
    assert "status=success" in result.output


def test_cli_ui_launches_local_dashboard(monkeypatch, tmp_path) -> None:
    calls = {}

    def fake_launch(**kwargs):
        calls.update(kwargs)

    monkeypatch.setattr("price_getter.cli._launch_ui", fake_launch)

    result = runner.invoke(
        app,
        [
            "ui",
            "--config",
            str(tmp_path / "config.yml"),
            "--db-url",
            f"sqlite:///{tmp_path / 'prices.db'}",
            "--host",
            "0.0.0.0",
            "--port",
            "9000",
            "--no-browser",
        ],
    )

    assert result.exit_code == 0
    assert calls["config_path"] == tmp_path / "config.yml"
    assert calls["db_url"] == f"sqlite:///{tmp_path / 'prices.db'}"
    assert calls["host"] == "0.0.0.0"
    assert calls["port"] == 9000
    assert calls["open_browser"] is False


def test_cli_ui_uses_env_defaults_and_preserves_cli_overrides(monkeypatch, tmp_path) -> None:
    calls = {}

    def fake_launch(**kwargs):
        calls.update(kwargs)

    monkeypatch.setattr("price_getter.cli._launch_ui", fake_launch)
    monkeypatch.setenv("PRICE_GETTER_CONFIG", str(tmp_path / "env-config.yml"))
    monkeypatch.setenv("PRICE_GETTER_DB_URL", f"sqlite:///{tmp_path / 'env-prices.db'}")
    monkeypatch.setenv("PRICE_GETTER_HOST", "0.0.0.0")
    monkeypatch.setenv("PRICE_GETTER_PORT", "8001")

    env_result = runner.invoke(app, ["ui", "--no-browser"])

    assert env_result.exit_code == 0
    assert calls["config_path"] == tmp_path / "env-config.yml"
    assert calls["db_url"] == f"sqlite:///{tmp_path / 'env-prices.db'}"
    assert calls["host"] == "0.0.0.0"
    assert calls["port"] == 8001
    assert calls["open_browser"] is False

    calls.clear()
    explicit_result = runner.invoke(
        app,
        [
            "ui",
            "--config",
            str(tmp_path / "cli-config.yml"),
            "--db-url",
            f"sqlite:///{tmp_path / 'cli-prices.db'}",
            "--host",
            "127.0.0.1",
            "--port",
            "9000",
            "--no-browser",
        ],
    )

    assert explicit_result.exit_code == 0
    assert calls["config_path"] == tmp_path / "cli-config.yml"
    assert calls["db_url"] == f"sqlite:///{tmp_path / 'cli-prices.db'}"
    assert calls["host"] == "127.0.0.1"
    assert calls["port"] == 9000
