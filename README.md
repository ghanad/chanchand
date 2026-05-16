# Price Getter

Price Getter is a CLI-first Python service foundation for collecting prices from public ecommerce pages and storing every observation in SQLite.

## Quick Start

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
price-getter init-db
price-getter validate-config --config config/example.yml
price-getter run --config config/example.yml
price-getter latest
price-getter ui --config config/example.yml --db-url sqlite:///price_getter.db
```

The example config contains a sample Digikala target. Replace it with your own product URLs, or disable targets before running against live sources.

For BRSAPI gold/currency targets, keep the API key out of YAML and set it in `.env`:

```bash
brsapi_api=your_api_key
```

## VPS Docker Compose

Prepare persistent files, then build and run the app behind Nginx:

```bash
mkdir -p data
cp config/example.yml data/config.yml
touch data/price_getter.db
docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'change-this-password' > data/.htpasswd-price-getter
docker compose build
docker compose up
```

Compose starts the web app, Nginx, and a `scheduler` service. The scheduler uses the same `/data/config.yml` and `/data/price_getter.db` mounts as the web app, then runs `price-getter run --config /data/config.yml` every `PRICE_GETTER_RUN_INTERVAL_SECONDS` seconds. Compose reads secrets from `.env`, including `brsapi_api`; set `PRICE_GETTER_RUN_INTERVAL_SECONDS=3600` there to change the collection interval. Set `PRICE_GETTER_PUBLIC_PORT` in `.env` to publish Nginx on a port other than `80`.

Run a one-off collection against the same compose config and SQLite DB with:

```bash
docker compose run --rm app price-getter run --config /data/config.yml
```

Nginx serves `/` and `/api/*` publicly, while `/admin` and direct mutating calls such as `/admin/run-now` require Basic Auth from `data/.htpasswd-price-getter`. Smoke-test the boundary over HTTP before adding TLS:

```bash
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/api/latest
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin
curl -i -X POST http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin/run-now
curl -i -u admin:change-this-password http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin
```

For TLS, keep this HTTP server for local/VPS smoke tests, then either let Certbot add a `listen 443 ssl` server using the same location rules and redirect port 80 to HTTPS, or terminate TLS at an external proxy/load balancer and forward plain HTTP to this Nginx service.

## Commands

- `price-getter init-db`: create SQLite tables.
- `price-getter validate-config --config config/example.yml`: validate source, product, and target mappings.
- `price-getter run --config config/example.yml`: fetch all enabled targets and store snapshots/errors.
- `price-getter latest`: show the latest snapshot for each product/source pair.
- `price-getter history <product-key>`: show historical snapshots for one product.
- `price-getter errors`: show recent fetch failures.
- `price-getter ui --config config/example.yml`: open a local dashboard for latest prices, history charts, recent runs/errors, manual collection, and YAML-backed product edits.

Prices are stored as normalized `price_irr` values. CLI reports also show `price_toman` because Iranian ecommerce sites, including Digikala's UI, commonly display prices in toman.

Supported source adapters are `generic_html`, `digikala_api`, `digikala_web`, `digikala`, and `brsapi_market`. The BRSAPI adapter sends a browser-style User-Agent by default and reads each target item from `adapter_settings.symbol` or `adapter_settings.name`.

For low-token LLM-assisted maintenance, start with `AGENTS.md`.
