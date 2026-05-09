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
```

The example config contains disabled sample targets. Replace them with real product URLs and enable the targets before running against live sources.

## Commands

- `price-getter init-db`: create SQLite tables.
- `price-getter validate-config --config config/example.yml`: validate source, product, and target mappings.
- `price-getter run --config config/example.yml`: fetch all enabled targets and store snapshots/errors.
- `price-getter latest`: show the latest snapshot for each product/source pair.
- `price-getter history <product-key>`: show historical snapshots for one product.
- `price-getter errors`: show recent fetch failures.

Prices are stored as normalized `price_irr` values. CLI reports also show `price_toman` because Iranian ecommerce sites, including Digikala's UI, commonly display prices in toman.
