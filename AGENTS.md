# AGENTS.md

This file is the low-token map for LLMs working on Price Getter. Keep it short, accurate, and updated.

## Maintenance Rule

Update this file in the same change whenever you:
- add, remove, rename, or split modules;
- change CLI commands, config fields, adapter names, database tables, or test commands;
- change the recommended file-reading path for common tasks.

If this file becomes long, prefer better routing and file maps over broad explanations. The goal is to reduce future prompt/context cost.

## Project Shape

Price Getter is a CLI-first Python app that collects ecommerce and market price observations and stores snapshots/errors in SQLite.

Core flow:
1. `price_getter.cli` parses Typer commands.
2. `price_getter.config` loads and validates YAML config with Pydantic.
3. `price_getter.runner.PriceRunner` loops through active targets, enforces per-source rate limits, calls adapters, and records results.
4. `price_getter.adapters.*` fetch and parse source-specific price data into `PriceObservation`.
5. `price_getter.repository` writes and reads SQLAlchemy models from `price_getter.models`.
6. `price_getter.ui` serves JSON endpoints plus the built React dashboard for SQLite history and YAML config edits.

## Read These First

- Cross-layer orientation: `docs/architecture.md`
- Adapter-specific guidance: `docs/adapters.md`
- Config/database guidance: `docs/storage-config.md`
- Local dashboard/API guidance: `docs/ui.md`
- CLI or command behavior: `src/price_getter/cli.py`
- Runtime env defaults: `src/price_getter/runtime.py`
- YAML schema or validation: `src/price_getter/config.py` and `config/example.yml`
- Run orchestration, HTTP client lifecycle, rate limiting: `src/price_getter/runner.py`
- Database schema: `src/price_getter/models.py`
- Database queries/writes: `src/price_getter/repository.py`
- Local web UI backend and JSON endpoints: `src/price_getter/ui.py`
- Local web UI frontend: `frontend/src/main.tsx`, `frontend/src/styles.css`, `frontend/vite.config.ts`; built assets are emitted to `src/price_getter/ui_dist/`
- Deployment and VPS operations: `docs/deploy.md`
- Container/VPS packaging: root `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and `nginx/price-getter.conf`
- Nginx Basic Auth for admin routes uses host-mounted `data/.htpasswd-price-getter`; creation and ops commands are documented in `docs/deploy.md`.
- Safe YAML product edits: `src/price_getter/config_editor.py`
- Price parsing, Persian/Arabic digits, stock text: `src/price_getter/pricing.py`
- Adapter interface and HTTP request helper: `src/price_getter/adapters/base.py`
- Generic selector-based scraping: `src/price_getter/adapters/generic_html.py`
- BRSAPI gold/currency behavior and `.env` API key lookup: `src/price_getter/adapters/brsapi_market.py`
- Digikala API behavior: `src/price_getter/adapters/digikala_api.py`
- Digikala HTML behavior: `src/price_getter/adapters/digikala_web.py`
- Adapter registry and backward-compatible aliases: `src/price_getter/adapters/__init__.py` and `src/price_getter/adapters/digikala.py`

## Avoid Reading Everything

Use `rg` first, then read only the matching function/class/test block. Avoid opening all of `frontend/src/main.tsx`, `frontend/src/styles.css`, or `ui.py` unless the request is broad.

Task routing:
- Add a new ecommerce source: read `docs/adapters.md`, `adapters/base.py`, `adapters/generic_html.py` or one similar adapter, `adapters/__init__.py`, and the relevant tests in `tests/test_adapters.py`.
- Change gold/currency market parsing: read `docs/adapters.md`, `adapters/brsapi_market.py`, `config/example.yml`, and `test_brsapi_*` tests in `tests/test_adapters.py`.
- Change Digikala API parsing: read `docs/adapters.md`, `adapters/digikala_api.py`, and `test_digikala_api_*` tests in `tests/test_adapters.py`.
- Change Digikala web/HTML parsing: read `docs/adapters.md`, `adapters/digikala_web.py`, and `test_digikala_web_*` tests in `tests/test_adapters.py`.
- Change config format: read `docs/storage-config.md`, `config.py`, `config/example.yml`, `tests/test_config.py`, and `test_cli_init_db_and_validate_config` in `tests/test_cli.py`.
- Change safe YAML product editing: read `docs/storage-config.md`, `config_editor.py`, config edit endpoints in `ui.py`, and `tests/test_config_editor.py`.
- Change stored data: read `docs/storage-config.md`, `models.py`, `repository.py`, `migrations/versions/`, `tests/test_repository.py`, and only CLI/UI tests that display the changed fields.
- Change output tables: read command function(s) in `cli.py` plus matching tests in `tests/test_cli.py`.
- Change run behavior: read `runner.py`, `repository.py`, and `tests/test_runner.py`.
- Change local UI API behavior: read `docs/ui.md`, the matching endpoint in `ui.py`, related serializer/helper functions in the same file, and `tests/test_ui.py`.
- Change local UI frontend: read `docs/ui.md`; use `rg` for the component/state name in `frontend/src/main.tsx` and CSS selector in `frontend/src/styles.css`; rebuild frontend only when shipped assets in `src/price_getter/ui_dist/` must change.
- Change deployment, production operations, Docker, Compose, Nginx, or backups: read `docs/deploy.md`, `Dockerfile`, `docker-compose.yml`, `nginx/price-getter.conf`, and relevant README pointers.

Useful anchors:
- CLI commands live in `cli.py` as Typer functions: `init_db`, `validate_config`, `run`, `latest`, `history`, `errors`, `ui`.
- UI route model: `/` and `/assets/*` are public UI assets; `GET`/`HEAD /api/*` are public read-only JSON APIs; `/admin` and `/admin/*` are Nginx Basic Auth protected admin UI and mutating endpoints, including `/admin/run-now` and `/admin/config/products...`.
- UI serialization helpers in `ui.py`: `_products_payload`, `_sources_payload`, `_serialize_price`, `_serialize_error`, `_serialize_run`.
- Adapter tests are grouped by name prefix: `test_generic_html_*`, `test_digikala_web_*`, `test_digikala_api_*`, `test_brsapi_*`.

## Local Commands

Use the project virtualenv when present:

```bash
.venv/bin/pytest
.venv/bin/pytest tests/test_adapters.py -k digikala_api
.venv/bin/pytest tests/test_adapters.py -k brsapi
.venv/bin/pytest tests/test_ui.py
.venv/bin/price-getter validate-config --config config/example.yml
.venv/bin/price-getter run --config config/example.yml
.venv/bin/price-getter latest
.venv/bin/price-getter ui --config config/example.yml --db-url sqlite:///price_getter.db
PRICE_GETTER_CONFIG=/data/config.yml PRICE_GETTER_DB_URL=sqlite:////data/price_getter.db PRICE_GETTER_HOST=0.0.0.0 PRICE_GETTER_PORT=8000 .venv/bin/price-getter ui --no-browser
cd frontend && npm install
cd frontend && npm run build
docker build -t price-getter:local .
docker run --rm -p 8000:8000 -v "$PWD/config/example.yml:/data/config.yml:ro" price-getter:local
docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'change-this-password' > data/.htpasswd-price-getter
docker compose build
docker compose up
docker compose up -d
docker compose ps
docker compose logs -f app
docker compose logs -f scheduler
docker compose run --rm app price-getter validate-config --config /data/config.yml
docker compose run --rm app price-getter init-db --db-url sqlite:////data/price_getter.db
PRICE_GETTER_RUN_INTERVAL_SECONDS=3600 docker compose up scheduler
docker compose run --rm app price-getter run --config /data/config.yml
docker compose run --rm app price-getter latest --db-url sqlite:////data/price_getter.db
docker compose run --rm app price-getter errors --db-url sqlite:////data/price_getter.db
docker compose exec app python -c "import sqlite3; src=sqlite3.connect('/data/price_getter.db'); dst=sqlite3.connect('/data/price_getter.backup.db'); src.backup(dst); dst.close(); src.close()"
```

## Config Notes

- Source adapter names currently allowed by config: `generic_html`, `digikala`, `digikala_api`, `digikala_web`, `brsapi_market`.
- Runtime env defaults for CLI/UI live in `runtime.py`: `PRICE_GETTER_CONFIG`, `PRICE_GETTER_DB_URL`, `PRICE_GETTER_HOST`, `PRICE_GETTER_PORT`; explicit CLI options override them.
- Docker Compose includes a `scheduler` service that shares the app's `/data/config.yml` and `/data/price_getter.db` mounts and repeats `price-getter run --config /data/config.yml`; tune with `PRICE_GETTER_RUN_INTERVAL_SECONDS` (default `3600`).
- `digikala` is a backward-compatible alias for `digikala_api`.
- `brsapi_market` targets select one item with `adapter_settings.symbol` or `adapter_settings.name`; default API key env name is `brsapi_api`.
- Prices are stored as `price_irr`.
- `price_multiplier` normalizes parsed source values into IRR. Use `10` when source text is toman.
- `TargetConfig.adapter_settings` overrides or supplements source-level adapter settings for one URL.
- `PriceRunner` skips non-`brsapi_market` products after any successful same-day `price_irr`; no-price snapshots and fetch errors can be retried the same day.

## Coding Notes

- Keep adapter modules small. Prefer shared helpers only when they avoid duplicate source-specific parsing code.
- Keep public behavior covered by tests before changing parser fallbacks.
- Preserve backward-compatible imports from `price_getter.adapters.digikala` unless intentionally removing old API.
- Do not hide broad exceptions inside adapters unless the runner should record them as fetch errors.
- Keep this file concise; it is for routing future LLM context, not full documentation.
