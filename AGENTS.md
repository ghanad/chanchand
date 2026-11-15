# AGENTS.md

This file is the low-token map for LLMs working on چن چند (chanchand / Price Getter). Keep it short, accurate, and updated.

## Product Rules (read before proposing features)

- **What it is:** Persian/RTL web app for the ordinary Iranian shopper: see a product's price history in Toman, USD, and grams of 18K gold. Success metric: monthly active users (MAU). History accuracy beats feature count; every product page keeps the Toman/USD/gold views meaningful.
- **Two product kinds:** **catalog (public)** products are created by admins, visible to all signed-in users, and cost no quota; **personal (private)** products are created by any user, owner-only, one slot each. Regular users cannot publish to the catalog. All routes require sign-in, so "public" means all signed-in users, not anonymous visitors.
- **Quota:** 3 free slots per user plus time-limited purchased slots (wallet/Zarinpal packages); quota applies to personal products only. Manual refresh is 1/day per user per product.
- **Market products** (`usd`, `gold`, `coin`, `gold-18k`, …) are admin-managed catalog products that give product prices USD/gold context; they are not a trading service, share one provider response, and are polled at most once per market interval.
- **Product identity:** adding a URL that already exists reuses that product (no duplicate, no extra slot); a non-admin editing the URL of a product several users track forks a private copy for themselves; deleting a shared private product only untracks it for that user.
- **Out of scope:** native mobile app (responsive web only).
- **Undecided — ask the owner, do not assume or build:** pricing/plans, price alerts, B2B data/API sales, ads/affiliate, paywalling core history, stores outside Iran.

## Maintenance Rule

Update this file in the same change whenever you:
- change product rules, target user, non-goals, or success metrics;
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
8. `src/lib/db/*` executes SQLite queries and writes with `better-sqlite3` (modular submodules under `src/lib/db/` for `connection`, `schema`, `migrations`, `seeds`, `sources`, `targets`, `products`, `productRefreshes`, `users`, `runs`, `snapshots`, `errors`, `scheduler`, `schedulerTime`, `wallet`, `payments`, re-exported via `index.ts`).
9. `src/app/api/*` and `src/app/admin/*` serve JSON endpoints for Next.js App Router.
10. `src/app/*` renders the modular App Router dashboard pages using `src/components/views/*` and Recharts.

## Read These First

- UI Dashboard: `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/change-password/page.tsx`, `src/app/account/layout.tsx` (transparent account layout), `src/app/account/page.tsx` (redirects to `/account/profile`), `src/app/account/profile/page.tsx` (standalone user profile & change password page), `src/app/account/security/page.tsx` (redirects to `/account/profile`), `src/app/account/wallet/page.tsx` (standalone wallet balance, top-up, quota, packages, subscriptions & transactions page with `src/components/views/wallet/*` subcomponents), `src/app/profile/page.tsx` (redirects to `/account/profile`), `src/app/page.tsx` (`/` -> `/products`), `src/app/admin/cron-runs/page.tsx`, `src/app/products/page.tsx`, `src/app/products/[key]/page.tsx`, `src/app/sources/page.tsx`, `src/app/admin/*`, `src/app/admin/products/[key]/page.tsx`, `src/components/views/*` (including `ProductDetailView` with `product-detail/*` subcomponents, `ProductsView` with `products/*` subcomponents, `UsersView` with `users/*` subcomponents, `SourcesView` with `sources/*` subcomponents, `CronRunsView` with `cron-runs/*` subcomponents, `wallet/*` subcomponents), `src/components/layout/*` (`AppShell`, `WorkspaceHeader` top navbar with `header/*` subcomponents incl. admin-only `BuildVersionBadge`, `UserMenu`), `src/components/common/*` (including `UpgradeQuotaModal`), `src/context/DashboardContext.tsx`, `src/app/globals.css` (orchestrator importing modular stylesheets in `src/app/styles/*`)
- API Route Handlers: `src/app/api/auth/*` (login, logout, me, change-password), `src/app/api/packages/route.ts` (active packages list), `src/app/api/payments/request/route.ts` (initiate payment), `src/app/api/payments/callback/route.ts` (verify & grant slots idempotently), `src/app/api/payments/route.ts` (user transactions), `src/app/api/user/profile/route.ts` (update email & mobile), `src/app/api/user/wallet/route.ts` (wallet balance, quota, transactions & subscriptions), `src/app/api/user/wallet/buy-slot/route.ts` (monthly single slot renewal), `src/app/api/latest/route.ts`, `src/app/api/products/route.ts`, `src/app/api/products/[key]/route.ts`, `src/app/api/products/[key]/enable/route.ts`, `src/app/api/products/[key]/disable/route.ts`, `src/app/api/products/[key]/refresh/route.ts` (1-per-day manual price refresh limit for regular users), `src/app/api/trigger-run/route.ts` (synchronous OS/cron trigger with 24-hour public and 24-hour LRU private batch scheduling), `src/app/api/admin/cron-runs/*`, `src/app/api/sources/route.ts`, `src/app/api/sources/iranjib/items/route.ts` (car catalog picker), `src/app/api/admin/sources/*`, `src/app/api/history/route.ts`, `src/app/api/runs/route.ts`, `src/app/api/errors/route.ts`, `src/app/api/health/route.ts`, `src/app/admin/run-now/route.ts`, `src/app/admin/config/products/route.ts`, `src/app/api/admin/users/*`
- Authentication, Security & RBAC: `src/lib/auth.ts`, `src/lib/jwt.ts`, `src/middleware.ts`, `src/lib/security.ts`, `src/lib/redirect.ts`, `src/lib/api-guard.ts` (includes `requireAdminOrApiKey`), `src/lib/run-lock.ts` (concurrency guard)
- Payment Gateways: `src/lib/payment/types.ts` (`PaymentGateway` interface), `src/lib/payment/zarinpal.ts` (ZarinPal REST v4 adapter), `src/lib/payment/mock.ts` (Mock adapter for testing/dev), `src/lib/payment/index.ts` (gateway registry & factory)
- Database schema & CRUD: `src/lib/db/*` (modular database package with `src/lib/db/index.ts`, managing `managed_products` with `user_id`, `is_public`, `show_usd_chart`, `show_gold_chart` (grams of 18K gold from the `gold-18k` product), `active_start_hour`, `active_end_hour`, `managed_targets`, `user_products` watchlist with `last_manual_refresh_at`, `product_refresh_logs` audit, `users` with `must_change_password`, `mobile`, `extra_slots`, `slot_expires_at`, `packages` with `duration_days`, `payment_transactions`, `user_subscriptions`, `getScheduledBatchTargets` with per-product configurable public hours [24-hour / 0-23 by default] and LRU 24-hour private batching)
- URL normalization & deduplication: `src/lib/urls.ts`
- Collection-window labels (۲۴/۱۲/… ساعته): `src/lib/schedule.ts`
- Per-product collection windows (`active_start_hour`/`active_end_hour` for every product, incl. market): `src/lib/db/scheduler.ts` (`getProductScheduleMap`, `getPublicProductScheduleMap`)
- Market source detection & well-known market product keys: `src/lib/market.ts`
- Build/version badge data (version + git SHA + build time inlined from `next.config.mjs`): `src/lib/build-info.ts`
- Configuration validation: `src/lib/config.ts` (optional fallback)
- Price parsing & digits normalization: `src/lib/pricing.ts`
- Logging & error descriptions (timestamped lines, `key=value` details, URL redaction, `LOG_LEVEL`): `src/lib/logger.ts`
- Runner & orchestrator: `src/lib/runner.ts`
- Adapters:
  - Digikala API: `src/lib/adapters/digikalaApi.ts`
  - Digikala Web: `src/lib/adapters/digikalaWeb.ts`
  - BRSAPI gold/currency: `src/lib/adapters/brsapiMarket.ts`
  - Servix gold/currency: `src/lib/adapters/servixMarket.ts`
  - Generic HTML: `src/lib/adapters/genericHtml.ts`
  - Iranjib car/market: `src/lib/adapters/iranjib.ts`
  - Fetch Utilities, Cookie Redirect & HTTP failure helpers (`HttpRequestError`, `Retry-After`): `src/lib/adapters/fetchUtils.ts`
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
- Source adapter names allowed: `generic_html`, `digikala`, `digikala_api`, `digikala_web`, `brsapi_market`, `servix_market`, `iranjib`, `iranjib_car`.
- Prices stored as `price_irr`.
- `price_multiplier`: 10 for TOMAN, 1 for IRR.
- Environment variables: `PRICE_GETTER_CONFIG`, `PRICE_GETTER_DB_URL`, `PRICE_GETTER_PORT`, `brsapi_api`, `SERVIX_API_KEY`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `TRIGGER_API_KEY`, `APP_TIMEZONE` (default `Asia/Tehran`), `LOG_LEVEL` (`debug`|`info`|`warn`|`error`, default `info`), `MARKET_POLL_INTERVAL_MINUTES` (default `60`; per-source override via `managed_sources.settings.market_poll_interval_minutes`).
- Market products (usd/gold/coin) honour their own `active_start_hour`/`active_end_hour`, are polled at most once per `MARKET_POLL_INTERVAL_MINUTES` (default 60), and share one cached API response (`getAdapter` returns a process-wide singleton), so N market products cost 1 request per hour. Provider quotas (e.g. Servix 50/day) are controlled by narrowing the window.
- Runner/CLI log lines are timestamped in `APP_TIMEZONE` with a UTC offset and end with `key=value` details (HTTP status, `retry_after`, `hint`, `elapsed_ms`); adapter HTTP failures throw `HttpRequestError` so `fetch_errors.message` explains the cause.
