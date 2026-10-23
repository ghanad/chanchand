# AGENTS.md

This file is the low-token map for LLMs working on Price Getter. Keep it short, accurate, and updated.

## Maintenance Rule

Update this file in the same change whenever you:
- add, remove, rename, or split modules;
- change CLI commands, config fields, adapter names, database tables, or test commands;
- change the recommended file-reading path for common tasks.

## Project Shape

Price Getter is a fullstack Next.js/React/TypeScript app that collects ecommerce and market prices and stores snapshots/errors in SQLite.

Core flow:
1. `src/cli/index.ts` parses Commander CLI commands (including `price-getter user ...`).
2. `src/lib/config.ts` loads and validates YAML config with Zod.
3. `src/lib/auth.ts` handles password hashing (bcryptjs) and JWT session tokens (jose).
4. `src/middleware.ts` guards public/protected routes and enforces RBAC (admin vs viewer).
5. `src/lib/runner.ts` loops through active targets (from SQLite `managed_targets`), enforces per-source rate limits, calls adapters, and records results.
6. `src/lib/adapters/*` fetch and parse source-specific price data into `PriceObservation`.
7. `src/lib/db.ts` executes SQLite queries and writes with `better-sqlite3` (tables: `runs`, `sources`, `products`, `product_targets`, `managed_products`, `managed_targets`, `managed_sources`, `price_snapshots`, `fetch_errors`, `users`).
8. `src/app/api/*` and `src/app/admin/*` serve JSON endpoints for Next.js App Router.
9. `src/app/*` renders the modular App Router dashboard pages using `src/components/views/*` and Recharts.

## Read These First

- UI Dashboard: `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/page.tsx` (`/`), `src/app/prices/page.tsx`, `src/app/history/page.tsx`, `src/app/runs/page.tsx`, `src/app/products/page.tsx`, `src/app/sources/page.tsx`, `src/app/admin/*`, `src/components/views/*`, `src/components/layout/*`, `src/components/common/*`, `src/context/DashboardContext.tsx`, `src/app/globals.css`
- API Route Handlers: `src/app/api/auth/*`, `src/app/api/latest/route.ts`, `src/app/api/products/route.ts`, `src/app/api/sources/route.ts`, `src/app/api/admin/sources/*`, `src/app/api/history/route.ts`, `src/app/api/runs/route.ts`, `src/app/api/errors/route.ts`, `src/app/api/health/route.ts`, `src/app/admin/run-now/route.ts`, `src/app/admin/config/products/route.ts`, `src/app/api/admin/users/*`
- Authentication, Security & RBAC: `src/lib/auth.ts`, `src/lib/jwt.ts`, `src/middleware.ts`, `src/lib/security.ts`, `src/lib/redirect.ts`, `src/lib/api-guard.ts`
- Database schema & CRUD: `src/lib/db.ts` (manages `managed_products`, `managed_targets` & `managed_sources`)
- Configuration validation: `src/lib/config.ts` (optional fallback)
- Price parsing & digits normalization: `src/lib/pricing.ts`
- Runner & orchestrator: `src/lib/runner.ts`
- Adapters:
  - Digikala API: `src/lib/adapters/digikalaApi.ts`
  - Digikala Web: `src/lib/adapters/digikalaWeb.ts`
  - BRSAPI gold/currency: `src/lib/adapters/brsapiMarket.ts`
  - Servix gold/currency: `src/lib/adapters/servixMarket.ts`
  - Generic HTML: `src/lib/adapters/genericHtml.ts`
  - Registry: `src/lib/adapters/index.ts`
- CLI entrypoint: `src/cli/index.ts`
- Documentation: `docs/architecture.md`, `docs/adapters.md`, `docs/storage-config.md`, `docs/ui.md`, `docs/deploy.md`
- Deployment & Packaging: `Dockerfile`, `docker-compose.yml`, `docs/deploy.md`

## Local Commands

```bash
npm install
npm test
npm run validate-config
npm run run
npm run latest
npm run history -- smart-air-purifier-6
npm run errors
npm run cli -- user list
npm run cli -- user create -u admin -p admin123 -r admin
npm run dev
npm run build
npm start
docker compose up -d
```

## Config Notes

- Products, targets, and sources are managed entirely in SQLite via UI/API.
- Source adapter names allowed: `generic_html`, `digikala`, `digikala_api`, `digikala_web`, `brsapi_market`, `servix_market`.
- Prices stored as `price_irr`.
- `price_multiplier`: 10 for TOMAN, 1 for IRR.
- Environment variables: `PRICE_GETTER_CONFIG`, `PRICE_GETTER_DB_URL`, `PRICE_GETTER_PORT`, `brsapi_api`, `SERVIX_API_KEY`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`.
