# Chanchand (Price Getter)

**Chanchand** (formerly Price Getter) is a comprehensive service for real-time tracking, comparison, and analysis of consumer products and financial market prices, built with **Next.js**, **React**, **TypeScript**, and **SQLite**. It collects prices from online stores (such as Digikala) and financial markets (gold and currency) and analyzes them with equivalent rates.

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database tables
npm run init-db

# Validate YAML configuration
npm run validate-config -- -c config/example.yml

# Fetch prices once
npm run run

# Show latest price snapshots in terminal
npm run latest

# Start web UI dashboard (development)
npm run dev

# Or build & start production server
npm run build
npm start
```

Open [http://localhost:8000](http://localhost:8000) for the public dashboard, or [http://localhost:8000/admin](http://localhost:8000/admin) for admin controls (adding/editing products and triggering manual collection runs).

## Configuration

All products, sources, and targets are configured and managed directly through the Web UI (`/admin`).

For BRSAPI gold/currency targets, store your API key in `.env`:

```bash
brsapi_api=your_api_key
```

## CLI Commands

- `npm run init-db`: initialize SQLite schema (`data/price_getter.db`).
- `npm run validate-config`: validate YAML config structure.
- `npm run run`: execute price collection for all enabled targets.
- `npm run latest`: print latest snapshot for each product/source pair.
- `npm run history -- <product-key>`: display price history for a specific product.
- `npm run errors`: show recent fetch failures.
- `npm test`: run unit tests with Vitest.

## Logs & Errors

Runner output is timestamped in the app timezone (`APP_TIMEZONE`, default `Asia/Tehran`) and ends with `key=value` details such as HTTP status, `retry_after`, `elapsed_ms` and an actionable `hint`:

```text
[2026-11-14 22:39:37 +03:30] WARN [Runner] run 371: failed coin-emami/servix_market | adapter=servix_market rate_limit_seconds=3 elapsed_ms=412 error_name=HttpRequestError error="Servix rate limit exceeded (HTTP 429 Too Many Requests); retry after 60s" status=429 retry_after=60 hint="source is throttling requests; raise rate_limit_seconds for this source or retry later"
```

- `status=429` means the provider throttled the run: raise that source's `rate_limit_seconds` (admin → sources) or collect less often.
- `npm run errors` lists recent failures with the same reason and a local timestamp.
- `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`) controls verbosity; `debug` also logs rate-limit waits.

## Docker Deployment

Build and start with Docker Compose:

```bash
docker compose up -d
```
