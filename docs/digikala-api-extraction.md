# Digikala API Price Extraction

This document describes a reusable way to extract product price data from Digikala using its JSON product API instead of scraping the product HTML page.

## Inputs

Start with a public Digikala product URL, such as:

```text
https://www.digikala.com/product/dkp-20769143/
https://www.digikala.com/fresh/product/dkp-856977/
https://www.digikala.com/product/dkp-14590108/?variant_id=50179968
```

The URL provides:

- the product ID, usually in the `dkp-{id}` part;
- optionally, a `variant_id` query parameter when a specific seller/variant must be selected;
- whether the product belongs to Digikala Fresh, based on `/fresh/` in the URL path.

## Product ID

Extract the numeric product ID from either of these URL patterns:

```text
dkp-20769143
/product/20769143
```

Example regex:

```regex
(?:dkp-|/product/)(\d+)
```

If no product ID can be extracted, stop and treat the URL as unsupported.

## Variant ID

If the URL contains `variant_id`, extract it from the query string:

```text
https://www.digikala.com/product/dkp-14590108/?variant_id=50179968
```

Only accept the value if it is numeric. If it is missing or invalid, continue without a requested variant.

## API Endpoint

For normal product URLs, request:

```text
https://api.digikala.com/v2/product/{product_id}/
```

For Fresh product URLs, where the original URL path contains `/fresh/`, request:

```text
https://api.digikala.com/fresh/v1/product/{product_id}/
```

Use JSON-oriented headers:

```http
User-Agent: price-getter/0.1
Accept: application/json
```

## Fresh Redirect Fallback

Some normal product API responses do not include product data and instead return a redirect payload pointing to a Fresh product:

```json
{
  "status": 302,
  "redirect_url": {
    "uri": "/fresh/product/dkp-856977/"
  }
}
```

If the normal API response has no product data and `redirect_url.uri` contains `/fresh/product/`, retry with the Fresh endpoint:

```text
https://api.digikala.com/fresh/v1/product/{product_id}/
```

## Product Payload

The expected product object is located at:

```text
response.data.product
```

If this object is missing after applying the Fresh fallback, stop and treat the extraction as failed.

## Variant Selection

Digikala product data can include a default variant and a list of variants:

```json
{
  "default_variant": {},
  "variants": []
}
```

Use this selection logic:

1. If a valid `variant_id` was requested, first compare it with `product.default_variant.id`.
2. If it does not match the default variant, search `product.variants[]` for the same `id`.
3. If the requested variant is not found, stop and report that the requested variant is unavailable in the API response.
4. If no `variant_id` was requested, use `product.default_variant` when it exists.
5. If there is no default variant, use the first variant in `product.variants[]` whose `status` is `marketable`.
6. If no marketable variant exists, use the first variant object in `product.variants[]`.

## Price Extraction

Read the price from the selected variant.

Preferred shape:

```json
{
  "price": {
    "selling_price": 97000000,
    "final_price": 97000000,
    "rrp_price": 121220000
  }
}
```

Price priority:

1. `variant.price.selling_price`
2. `variant.price.final_price`
3. `variant.price.rrp_price`
4. `variant.price`, if the value itself is directly parseable

Digikala API prices are already in Iranian rial, so store the parsed value as IRR without converting from toman.

## Seller Extraction

Read the seller from `variant.seller`.

If it is a string, trim it and use it directly.

If it is an object, use the first non-empty value from:

1. `seller.title`
2. `seller.name`
3. `seller.title_fa`

## Availability Extraction

Check these fields in order:

1. `variant.status`
2. `product.status`
3. `product.data_layer.dimension20`

Map these values to `in_stock`:

```text
marketable
available
active
```

Map these values to `out_of_stock`:

```text
not_marketable
out_of_stock
unavailable
inactive
```

If no known status is found, return `unknown`.

## Title Extraction

Use the first non-empty product title from:

1. `product.title_fa`
2. `product.title_en`
3. `product.test_title_fa`

## Suggested Output

Return a normalized object like this:

```json
{
  "title": "صندلی اداری نیلپر مدل OCT 515o",
  "seller": "دیجی‌کالا",
  "price_irr": 97000000,
  "availability": "in_stock",
  "raw": {
    "source": "digikala_api",
    "api_url": "https://api.digikala.com/v2/product/3271540/",
    "product_id": 3271540,
    "requested_variant_id": null,
    "variant_id": 50557025
  }
}
```

## Failure Cases

Treat extraction as failed when:

- the product ID cannot be extracted from the URL;
- the API request fails;
- the response is not valid JSON;
- `response.data.product` is missing;
- a requested `variant_id` is not present in `default_variant` or `variants`;
- no price can be extracted and availability is also `unknown`.

## Pseudocode

```text
extract product_id from URL
extract variant_id from URL query if present and numeric

if URL path contains "/fresh/":
    api_url = "https://api.digikala.com/fresh/v1/product/{product_id}/"
else:
    api_url = "https://api.digikala.com/v2/product/{product_id}/"

payload = GET api_url as JSON
product = payload.data.product

if product is missing and api_url is normal endpoint:
    if payload.redirect_url.uri contains "/fresh/product/":
        api_url = "https://api.digikala.com/fresh/v1/product/{product_id}/"
        payload = GET api_url as JSON
        product = payload.data.product

if product is missing:
    fail

variant = select requested variant or best available variant
if requested variant_id exists but variant was not found:
    fail

price_irr = first parseable price from:
    variant.price.selling_price
    variant.price.final_price
    variant.price.rrp_price
    variant.price

seller = extract seller from variant.seller
availability = infer availability from variant/product status
title = first title from title_fa, title_en, test_title_fa

return normalized observation
```

## Price History (last ~30 days)

Digikala also exposes the data behind the "تاریخچه قیمت" chart. It is fetched
**once per product**, when the product is first added to the database, so a new
product starts with a populated chart instead of an empty one. Products that
already exist keep the snapshots we collected ourselves; nothing is fetched
again for them.

### Endpoint

```text
GET https://api.digikala.com/v1/product/{product_id}/price-chart/
Referer: https://www.digikala.com/
Accept: application/json
```

The `Referer` header is **required**: without it the API answers `429`. The
endpoint is also tightly rate limited (roughly two requests per burst), so keep
at least ~5 seconds between calls.

### Payload

```json
{
  "status": 200,
  "data": {
    "today": "2026-11-14",
    "chart_selection_title": "انتخاب رنگ",
    "price_chart": [
      {
        "id": 0,
        "title": "مشکی",
        "history": [
          {
            "day": "1405/07/23",
            "selling_price": 3589990000,
            "rrp_price": 3933670000,
            "is_marketable": true,
            "seller": "دیجی‌کالا",
            "product_warranty": "گارانتی اصلی"
          }
        ]
      }
    ]
  }
}
```

Notes:

- `data.today` is Gregorian; every `history[].day` is **Jalali** (`1405/07/23`).
- `price_chart` is grouped by one variant dimension (colour or size), named by
  `chart_selection_title`. Group `id` is an index, **not** a `variant_id`.
- Prices are already in IRR.
- Days without an offer simply have no row.
- The window is fixed at ~30 days; `days`/`range`/`period`/`from`/`to` query
  parameters are ignored.
- Some products return an empty `price_chart` (no recent offers).
- `product.has_price_chart` and `product.meta.price_chart_url` in the product
  payload tell you whether a chart exists.

### Picking the right group

When there is more than one group, read the product's `default_variant` and
match `color.title` / `size.title` against the group `title`; if nothing
matches, choose the group whose latest price is closest to
`default_variant.price.selling_price`. The product payload is served from
`https://api.digikala.com/product/v1/products/{id}/` (the older
`/v2/product/{id}/` path is kept as a fallback).

### Implementation

- `src/lib/digikalaHistory.ts` — fetch, parse, group selection and backfill.
- `src/lib/jalali.ts` — Jalali → Gregorian conversion for `observed_at`.
- Backfilled rows are written to `price_snapshots` under a `runs` row with
  `trigger_source = 'backfill'` (excluded from the latest/cron run views).
  Calendar days that already have a snapshot are skipped, so the backfill never
  duplicates or overwrites our own collection.
