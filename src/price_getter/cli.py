from __future__ import annotations

from pathlib import Path
from typing import Any

import typer

from price_getter.config import ConfigLoadError, load_config
from price_getter.db import DEFAULT_DB_URL, init_database, session_scope
from price_getter.repository import latest_snapshots, product_history, recent_errors
from price_getter.runner import PriceRunner

app = typer.Typer(no_args_is_help=True, help="Collect ecommerce price snapshots into SQLite.")


@app.command("init-db")
def init_db(
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
) -> None:
    init_database(db_url)
    typer.echo(f"Database initialized: {db_url}")


@app.command("validate-config")
def validate_config(
    config_path: Path = typer.Option(Path("config/example.yml"), "--config", "-c", help="YAML config path."),
) -> None:
    try:
        config = load_config(config_path)
    except ConfigLoadError as exc:
        raise typer.BadParameter(str(exc)) from exc

    typer.echo(
        "Config is valid: "
        f"{len(config.sources)} sources, "
        f"{len(config.products)} products, "
        f"{len(config.active_targets())}/{len(config.targets)} active targets"
    )


@app.command("run")
def run(
    config_path: Path = typer.Option(Path("config/example.yml"), "--config", "-c", help="YAML config path."),
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
) -> None:
    try:
        summary = PriceRunner(db_url=db_url).run_config_file(config_path)
    except ConfigLoadError as exc:
        raise typer.BadParameter(str(exc)) from exc

    typer.echo(
        f"Run {summary.run_id} finished with status={summary.status}; "
        f"targets={summary.target_count}, success={summary.success_count}, errors={summary.error_count}"
    )


@app.command("latest")
def latest(
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
    limit: int = typer.Option(100, "--limit", min=1, help="Maximum product/source rows."),
) -> None:
    init_database(db_url)
    with session_scope(db_url) as session:
        rows = latest_snapshots(session, limit=limit)
    if not rows:
        typer.echo("No price snapshots found.")
        return
    _echo_table(
        ["product", "source", "price_toman", "price_irr", "availability", "seller", "observed_at"],
        [
            [
                row.product_key,
                row.source_key,
                _price_toman(row.price_irr),
                row.price_irr,
                row.availability,
                row.seller,
                row.observed_at,
            ]
            for row in rows
        ],
    )


@app.command("history")
def history(
    product_key: str = typer.Argument(..., help="Product key from config."),
    source_key: str | None = typer.Option(None, "--source", help="Optional source key filter."),
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
    limit: int = typer.Option(50, "--limit", min=1, help="Maximum rows."),
) -> None:
    init_database(db_url)
    with session_scope(db_url) as session:
        rows = product_history(session, product_key, source_key=source_key, limit=limit)
    if not rows:
        typer.echo("No history found.")
        return
    _echo_table(
        ["product", "source", "price_toman", "price_irr", "availability", "seller", "observed_at"],
        [
            [
                row.product_key,
                row.source_key,
                _price_toman(row.price_irr),
                row.price_irr,
                row.availability,
                row.seller,
                row.observed_at,
            ]
            for row in rows
        ],
    )


@app.command("errors")
def errors(
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
    limit: int = typer.Option(50, "--limit", min=1, help="Maximum rows."),
) -> None:
    init_database(db_url)
    with session_scope(db_url) as session:
        rows = recent_errors(session, limit=limit)
    if not rows:
        typer.echo("No fetch errors found.")
        return
    _echo_table(
        ["product", "source", "type", "message", "observed_at"],
        [[row.product_key, row.source_key, row.error_type, row.message, row.observed_at] for row in rows],
    )


@app.command("ui")
def ui(
    config_path: Path = typer.Option(Path("config/example.yml"), "--config", "-c", help="YAML config path."),
    db_url: str = typer.Option(DEFAULT_DB_URL, "--db-url", help="SQLAlchemy database URL."),
    host: str = typer.Option("127.0.0.1", "--host", help="Host to bind the local web UI."),
    port: int = typer.Option(8000, "--port", min=1, max=65535, help="Port to bind the local web UI."),
    no_browser: bool = typer.Option(False, "--no-browser", help="Do not open a browser tab automatically."),
) -> None:
    _launch_ui(config_path=config_path, db_url=db_url, host=host, port=port, open_browser=not no_browser)


def _launch_ui(*, config_path: Path, db_url: str, host: str, port: int, open_browser: bool) -> None:
    from price_getter.ui import run_ui

    run_ui(config_path=config_path, db_url=db_url, host=host, port=port, open_browser=open_browser)


def _echo_table(headers: list[str], rows: list[list[Any]]) -> None:
    string_rows = [[_format_cell(cell) for cell in row] for row in rows]
    widths = [
        max(len(header), *(len(row[index]) for row in string_rows))
        for index, header in enumerate(headers)
    ]
    typer.echo("  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    typer.echo("  ".join("-" * width for width in widths))
    for row in string_rows:
        typer.echo("  ".join(cell.ljust(widths[index]) for index, cell in enumerate(row)))


def _format_cell(value: Any) -> str:
    if value is None:
        return "-"
    text = str(value)
    return text if len(text) <= 80 else text[:77] + "..."


def _price_toman(price_irr: int | None) -> int | str | None:
    if price_irr is None:
        return None
    if price_irr % 10 == 0:
        return price_irr // 10
    return f"{price_irr / 10:.1f}"


def main() -> None:
    app()
