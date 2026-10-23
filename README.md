# چن چند (chanchand) — Price Getter

**چن چند (chanchand)** (قبلاً Price Getter) یک سرویس جامع برای دریافت، مقایسه و تحلیل لحظه‌ای قیمت کالاها و بازارهای مالی است که با **Next.js**، **React**، **TypeScript** و **SQLite** ساخته شده است. این سامانه قیمت‌ها را از فروشگاه‌های آنلاین (مانند دیجی‌کالا) و بازارهای مالی (طلا و ارز) جمع‌آوری و با نرخ‌های معادل تحلیل می‌کند.

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

Targets are defined in `config/example.yml`.
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

## Docker Deployment

Build and start with Docker Compose:

```bash
docker compose up -d
```
