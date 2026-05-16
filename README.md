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
docker compose build
docker compose up
```

Compose reads secrets from `.env`, including `brsapi_api`. Set `PRICE_GETTER_PUBLIC_PORT` in `.env` to publish Nginx on a port other than `80`.

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
