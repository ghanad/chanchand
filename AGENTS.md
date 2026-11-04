# AGENTS.md

This file is the low-token map for LLMs working on چن چند (chanchand / Price Getter). Keep it short, accurate, and updated.

## Maintenance Rule

Update this file in the same change whenever you:
- add, remove, rename, or split modules;
- change CLI commands, config fields, adapter names, database tables, or test commands;
- change the recommended file-reading path for common tasks.

## Project Shape

چن چند (chanchand - formerly Price Getter) is a fullstack Next.js/React/TypeScript app that collects ecommerce and market prices and stores snapshots/errors in SQLite.

Core flow:
1. `src/cli/index.ts` parses Commander CLI commands (including `price-getter user ...`).
2. `src/lib/config.ts` loads and validates YAML config with Zod.
3. `src/lib/auth.ts` handles password hashing (bcryptjs) and JWT session tokens (jose).
4. `src/middleware.ts` guards public/protected routes and enforces RBAC (admin vs viewer).
5. `src/lib/runner.ts` loops through active targets (from SQLite `managed_targets`), enforces per-source rate limits, calls adapters, and records results.
6. `src/lib/adapters/*` fetch and parse source-specific price data into `PriceObservation`.
7. `src/lib/payment/*` provides pluggable payment gateways (`PaymentGateway` interface with Zarinpal REST v4 & Mock adapters).
8. `src/lib/db/*` executes SQLite queries and writes with `better-sqlite3` (modular submodules under `src/lib/db/` for `connection`, `schema`, `sources`, `products`, `users`, `runs`, `scheduler`, `payments`, re-exported via `index.ts`).
9. `src/app/api/*` and `src/app/admin/*` serve JSON endpoints for Next.js App Router.
10. `src/app/*` renders the modular App Router dashboard pages using `src/components/views/*` and Recharts.

## Read These First

- UI Dashboard: `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/change-password/page.tsx`, `src/app/account/layout.tsx` (transparent account layout), `src/app/account/page.tsx` (redirects to `/account/profile`), `src/app/account/profile/page.tsx` (standalone user profile & change password page), `src/app/account/security/page.tsx` (redirects to `/account/profile`), `src/app/account/wallet/page.tsx` (standalone wallet balance, top-up, quota, packages, subscriptions & transactions page), `src/app/profile/page.tsx` (redirects to `/account/profile`), `src/app/page.tsx` (`/` -> `/products`), `src/app/runs/page.tsx`, `src/app/admin/cron-runs/page.tsx`, `src/app/products/page.tsx`, `src/app/products/[key]/page.tsx`, `src/app/sources/page.tsx`, `src/app/admin/*`, `src/app/admin/products/[key]/page.tsx`, `src/components/views/*` (including `AccountView`, `ProductDetailView` with `product-detail/*` subcomponents, `ProductsView` with `products/*` subcomponents, `UsersView` with `users/*` subcomponents, `SourcesView` with `sources/*` subcomponents, `RunsView`, `CronRunsView`), `src/components/layout/*` (`AppShell`, `WorkspaceHeader` top navbar, `UserMenu`), `src/components/common/*` (including `UpgradeQuotaModal`), `src/context/DashboardContext.tsx`, `src/app/globals.css`
- API Route Handlers: `src/app/api/auth/*` (login, logout, me, change-password), `src/app/api/packages/route.ts` (active packages list), `src/app/api/payments/request/route.ts` (initiate payment), `src/app/api/payments/callback/route.ts` (verify & grant slots idempotently), `src/app/api/payments/route.ts` (user transactions), `src/app/api/user/profile/route.ts` (update email & mobile), `src/app/api/user/wallet/route.ts` (wallet balance, quota, transactions & subscriptions), `src/app/api/user/wallet/buy-slot/route.ts` (monthly single slot renewal), `src/app/api/latest/route.ts`, `src/app/api/products/route.ts`, `src/app/api/products/[key]/route.ts`, `src/app/api/products/[key]/enable/route.ts`, `src/app/api/products/[key]/disable/route.ts`, `src/app/api/products/[key]/refresh/route.ts`, `src/app/api/trigger-run/route.ts` (synchronous OS/cron trigger with 8-23 hourly public and 24-hour LRU private batch scheduling), `src/app/api/admin/cron-runs/*`, `src/app/api/sources/route.ts`, `src/app/api/admin/sources/*`, `src/app/api/history/route.ts`, `src/app/api/runs/route.ts`, `src/app/api/errors/route.ts`, `src/app/api/health/route.ts`, `src/app/admin/run-now/route.ts`, `src/app/admin/config/products/route.ts`, `src/app/api/admin/users/*`
- Authentication, Security & RBAC: `src/lib/auth.ts`, `src/lib/jwt.ts`, `src/middleware.ts`, `src/lib/security.ts`, `src/lib/redirect.ts`, `src/lib/api-guard.ts` (includes `requireAdminOrApiKey`), `src/lib/run-lock.ts` (concurrency guard)
- Payment Gateways: `src/lib/payment/types.ts` (`PaymentGateway` interface), `src/lib/payment/zarinpal.ts` (ZarinPal REST v4 adapter), `src/lib/payment/mock.ts` (Mock adapter for testing/dev), `src/lib/payment/index.ts` (gateway registry & factory)
- Database schema & CRUD: `src/lib/db/*` (modular database package with `src/lib/db/index.ts`, managing `managed_products` with `user_id` and `is_public`, `managed_targets`, `user_products` watchlist, `users` with `must_change_password`, `mobile`, `extra_slots`, `slot_expires_at`, `packages` with `duration_days`, `payment_transactions`, `user_subscriptions`, `getScheduledBatchTargets` for hourly public 8-23 and LRU 24-hour private batching)
- URL normalization & deduplication: `src/lib/urls.ts`
- Configuration validation: `src/lib/config.ts` (optional fallback)
- Price parsing & digits normalization: `src/lib/pricing.ts`
- Runner & orchestrator: `src/lib/runner.ts`
- Adapters:
  - Digikala API: `src/lib/adapters/digikalaApi.ts`
  - Digikala Web: `src/lib/adapters/digikalaWeb.ts`
  - BRSAPI gold/currency: `src/lib/adapters/brsapiMarket.ts`
  - Servix gold/currency: `src/lib/adapters/servixMarket.ts`
  - Generic HTML: `src/lib/adapters/genericHtml.ts`
  - Fetch Utilities & Cookie Redirect: `src/lib/adapters/fetchUtils.ts`
  - Registry: `src/lib/adapters/index.ts`
- CLI entrypoint: `src/cli/index.ts`
- Documentation: `docs/architecture.md`, `docs/adapters.md`, `docs/storage-config.md`, `docs/ui.md`, `docs/deploy.md`
- Deployment & Packaging: `Dockerfile`, `docker-compose.yml`, `docs/deploy.md`

## Local Commands

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run validate-config
npm run run
npm run latest
npm run history -- smart-air-purifier-6
npm run errors
npm run cli -- user list
npm run cli -- user create -u admin -p admin123 -r admin --must-change-password
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
- Environment variables: `PRICE_GETTER_CONFIG`, `PRICE_GETTER_DB_URL`, `PRICE_GETTER_PORT`, `brsapi_api`, `SERVIX_API_KEY`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `TRIGGER_API_KEY`.
