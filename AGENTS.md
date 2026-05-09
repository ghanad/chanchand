# AGENTS.md

This file is the low-token map for LLMs working on Price Getter. Keep it short, accurate, and updated.

## Maintenance Rule

Update this file in the same change whenever you:
- add, remove, rename, or split modules;
- change CLI commands, config fields, adapter names, database tables, or test commands;
- change the recommended file-reading path for common tasks.

If this file becomes long, prefer better routing and file maps over broad explanations. The goal is to reduce future prompt/context cost.

## Project Shape

Price Getter is a CLI-first Python app that collects ecommerce price observations and stores snapshots/errors in SQLite.

Core flow:
1. `price_getter.cli` parses Typer commands.
2. `price_getter.config` loads and validates YAML config with Pydantic.
3. `price_getter.runner.PriceRunner` loops through active targets, enforces per-source rate limits, calls adapters, and records results.
4. `price_getter.adapters.*` fetch and parse source-specific price data into `PriceObservation`.
5. `price_getter.repository` writes and reads SQLAlchemy models from `price_getter.models`.
6. `price_getter.ui` serves a local FastAPI dashboard for SQLite history and YAML config edits.

## Read These First

- CLI or command behavior: `src/price_getter/cli.py`
- YAML schema or validation: `src/price_getter/config.py` and `config/example.yml`
- Run orchestration, HTTP client lifecycle, rate limiting: `src/price_getter/runner.py`
- Database schema: `src/price_getter/models.py`
- Database queries/writes: `src/price_getter/repository.py`
- Local web UI and JSON endpoints: `src/price_getter/ui.py`, `src/price_getter/templates/index.html`, `src/price_getter/static/app.js`, `src/price_getter/static/styles.css`
- Safe YAML product edits: `src/price_getter/config_editor.py`
- Price parsing, Persian/Arabic digits, stock text: `src/price_getter/pricing.py`
- Adapter interface and HTTP request helper: `src/price_getter/adapters/base.py`
- Generic selector-based scraping: `src/price_getter/adapters/generic_html.py`
- Digikala API behavior: `src/price_getter/adapters/digikala_api.py`
- Digikala HTML behavior: `src/price_getter/adapters/digikala_web.py`
- Adapter registry and backward-compatible aliases: `src/price_getter/adapters/__init__.py` and `src/price_getter/adapters/digikala.py`

## Avoid Reading Everything

Use this task routing to keep context small:
- Add a new ecommerce source: read `adapters/base.py`, `adapters/generic_html.py` or one similar adapter, `adapters/__init__.py`, and `tests/test_adapters.py`.
- Change Digikala API parsing: read `adapters/digikala_api.py` and Digikala tests in `tests/test_adapters.py`.
- Change Digikala web/HTML parsing: read `adapters/digikala_web.py` and Digikala tests in `tests/test_adapters.py`.
- Change config format: read `config.py`, `config/example.yml`, `tests/test_config.py`, and CLI validation tests.
- Change stored data: read `models.py`, `repository.py`, `migrations/versions/`, and repository/CLI tests.
- Change output tables: read `cli.py` and `tests/test_cli.py`.
- Change run behavior: read `runner.py`, `repository.py`, and `tests/test_runner.py`.
- Change local UI behavior: read `ui.py`, `config_editor.py`, UI static/template files, and UI/CLI tests.

## Local Commands

Use the project virtualenv when present:

```bash
.venv/bin/pytest
.venv/bin/price-getter validate-config --config config/example.yml
.venv/bin/price-getter run --config config/example.yml
.venv/bin/price-getter latest
.venv/bin/price-getter ui --config config/example.yml --db-url sqlite:///price_getter.db
```

## Config Notes

- Source adapter names currently allowed by config: `generic_html`, `digikala`, `digikala_api`, `digikala_web`.
- `digikala` is a backward-compatible alias for `digikala_api`.
- Prices are stored as `price_irr`.
- `price_multiplier` normalizes parsed source values into IRR. Use `10` when source text is toman.
- `TargetConfig.adapter_settings` overrides or supplements source-level adapter settings for one URL.

## Coding Notes

- Keep adapter modules small. Prefer shared helpers only when they avoid duplicate source-specific parsing code.
- Keep public behavior covered by tests before changing parser fallbacks.
- Preserve backward-compatible imports from `price_getter.adapters.digikala` unless intentionally removing old API.
- Do not hide broad exceptions inside adapters unless the runner should record them as fetch errors.
- Keep this file concise; it is for routing future LLM context, not full documentation.
