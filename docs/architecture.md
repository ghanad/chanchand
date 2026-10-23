# Architecture Notes

Read this only when a change crosses multiple layers.

## Request Flow

1. CLI commands in `src/cli/index.ts` (built with Commander) load config, manage users, or query and execute price fetching in SQLite.
2. `src/lib/config.ts` validates YAML into TypeScript types using Zod schemas (`ConfigSchema`, `SourceConfigSchema`, `ProductConfigSchema`).
3. `src/lib/runner.ts` loops through active targets and sources from SQLite (`managed_products`, `managed_targets`, `managed_sources`), throttles per source with rate limits, and invokes the appropriate adapter.
4. Adapters implement `PriceAdapter` from `src/lib/adapters/types.ts` and return `PriceObservation`.
5. `src/lib/db.ts` executes SQLite queries and writes directly with `better-sqlite3` in WAL mode (tables: `runs`, `managed_sources`, `managed_products`, `managed_targets`, `price_snapshots`, `fetch_errors`, `users`).
6. Next.js App Router route handlers in `src/app/api/*` and `src/app/admin/*` serve JSON APIs, while page routes (`src/app/*`) render modular views in `src/components/views/*` using React and Recharts.

## Boundaries

- Config validation (Zod) rejects malformed YAML or inputs before execution starts.
- Adapters encapsulate source-specific network requests and HTML/JSON parsing, throwing or returning clear errors for expected failures.
- Runner controls run-level accounting, concurrency, rate limiting, and error logging.
- `src/lib/db.ts` isolates SQLite prepared statements and CRUD helper functions from CLI, runner, and UI.
- UI backend handlers enforce JWT authentication and role-based permissions (`admin` vs `viewer`), returning JSON responses; React components handle presentation and modal states.

## Cross-Layer Changes

When a new persisted field or table is added, update:
- Schema definition and migrations in `src/lib/db.ts` (`initDatabaseSchema`)
- TypeScript types/interfaces in `src/lib/types.ts` and `src/lib/db.ts`
- CRUD methods in `src/lib/db.ts`
- Serializers in `src/lib/serializers.ts` if exposed to the UI/API
- CLI commands in `src/cli/index.ts` if displayed in terminal output
- Unit tests in `tests/db.test.ts`, `tests/adapters.test.ts`, or relevant test suites
