# Storage And Config Notes

Read this when changing configuration schemas, database schema, or persistence behavior.

## Configuration (Zod & SQLite)

- In modern Price Getter, products, targets, and sources are primarily stored and managed directly in SQLite via the UI and REST APIs (`managed_products`, `managed_targets`, `managed_sources`).
- Zod schemas for YAML configuration validation live in `src/lib/config.ts` (`ConfigSchema`, `ProductConfigSchema`, `SourceConfigSchema`, `TargetConfigSchema`).
- Example configuration lives in `config/example.yml`.
- Config validation tests live in `tests/config.test.ts`.
- CLI config validation command: `npm run validate-config -- -c config/example.yml`.

## Database (SQLite with better-sqlite3)

- Connection initialization and PRAGMA settings (WAL mode, foreign keys) live in `src/lib/db.ts`.
- Database schema initialization and table creation live in `initDatabaseSchema()` in `src/lib/db.ts`.
- Database tests live in `tests/db.test.ts`.

### Tables Overview

- `managed_products`: Product catalog definitions (`key`, `name`, `category`, `enabled`, `sort_order`, `notes`, `created_at`).
- `managed_sources`: Price source configurations (`key`, `name`, `adapter`, `base_url`, `rate_limit_per_second`, `adapter_settings_json`, `created_at`).
- `managed_targets`: URL targets linking products to sources (`id`, `product_key`, `source_key`, `url`, `enabled`, `price_multiplier`, `adapter_settings_json`, `created_at`).
- `runs`: Run execution records (`id`, `started_at`, `completed_at`, `status`, `target_count`, `success_count`, `error_count`).
- `price_snapshots`: Captured price records (`id`, `run_id`, `product_key`, `source_key`, `price_irr`, `captured_at`, `availability`, `title`, `seller`, `raw_payload_json`).
- `fetch_errors`: Target extraction error logs (`id`, `run_id`, `product_key`, `source_key`, `url`, `error_message`, `occurred_at`).
- `users`: User authentication & RBAC (`id`, `username`, `password_hash`, `role`, `created_at`, `updated_at`).

## Change Checklist

- **New YAML field**: Update Zod schema in `src/lib/config.ts`, `config/example.yml`, and `tests/config.test.ts`.
- **New Adapter**: Update `SourceConfigSchema` in `src/lib/config.ts`, `src/lib/adapters/index.ts`, UI dropdown in `src/components/views/SourcesView.tsx`, and `tests/adapters.test.ts`.
- **New DB table or column**: Update `initDatabaseSchema` in `src/lib/db.ts`, TypeScript interfaces in `src/lib/types.ts` and `src/lib/db.ts`, CRUD methods in `src/lib/db.ts`, serializers in `src/lib/serializers.ts`, and `tests/db.test.ts`.
- **Changed stored semantics**: Update code paths that read the field (in `runner.ts`, `serializers.ts`, and UI views), not only the write path.
