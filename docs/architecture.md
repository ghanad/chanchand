# Architecture Notes

Read this only when a change crosses multiple layers.

## Request Flow

1. CLI commands in `src/price_getter/cli.py` load config or query SQLite.
2. `src/price_getter/config.py` validates YAML into Pydantic models.
3. `src/price_getter/runner.py` loops active targets, throttles per source, and calls adapters.
4. Adapters return `PriceObservation` from `src/price_getter/adapters/base.py`.
5. `src/price_getter/repository.py` records runs, prices, and fetch errors through SQLAlchemy models.
6. `src/price_getter/ui.py` exposes JSON APIs and serves built frontend assets.

## Boundaries

- Config validation should reject bad user input before runner work starts.
- Adapters should parse one source and raise `AdapterError` for source-specific failures.
- Runner should decide run-level accounting, rate limits, and error recording.
- Repository should hide SQLAlchemy query/write details from CLI, runner, and UI.
- UI backend should return JSON-ready payloads; React should handle presentation state.

## Cross-Layer Changes

When a new persisted field is added, update:
- `models.py`
- `repository.py`
- migrations under `migrations/versions/`
- serializers in `ui.py` if shown in dashboard
- CLI tables in `cli.py` if shown in terminal output
- repository/CLI/UI tests that cover the field
