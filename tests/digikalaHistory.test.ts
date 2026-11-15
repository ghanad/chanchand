import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, addManagedSource, updateManagedSource, getSourcesMap } from '../src/lib/db';
import {
  parsePriceChartPayload,
  pickPriceChartGroup,
  backfillDigikalaPriceHistory,
  priceChartApiUrl,
} from '../src/lib/digikalaHistory';
import { SourceConfig } from '../src/lib/types';

const SOURCE: SourceConfig = {
  adapter: 'digikala_api',
  timeout_seconds: 10,
  rate_limit_seconds: 5,
  currency: 'IRR',
  price_multiplier: 1,
  headers: {},
  settings: {},
};

function chartPayload() {
  return {
    status: 200,
    data: {
      today: '2026-11-14',
      chart_selection_title: 'انتخاب رنگ',
      price_chart: [
        {
          id: 0,
          title: 'مشکی',
          history: [
            {
              day: '1405/08/20',
              selling_price: 1000000,
              rrp_price: 1200000,
              is_marketable: true,
              seller: 'فروشنده الف',
              product_warranty: 'گارانتی اصلی',
            },
            {
              day: '1405/08/21',
              selling_price: 1100000,
              rrp_price: 1200000,
              is_marketable: true,
              seller: 'فروشنده الف',
              product_warranty: 'گارانتی اصلی',
            },
            {
              day: '1405/08/22',
              selling_price: 1150000,
              rrp_price: 1200000,
              is_marketable: false,
              seller: 'فروشنده ب',
              product_warranty: 'گارانتی اصلی',
            },
          ],
        },
        {
          id: 1,
          title: 'سفید',
          history: [
            {
              day: '1405/08/22',
              selling_price: 900000,
              rrp_price: 900000,
              is_marketable: true,
              seller: 'فروشنده ج',
              product_warranty: null,
            },
          ],
        },
      ],
    },
  };
}

function jsonResponse(payload: any) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function productPayload(color = 'مشکی', sellingPrice = 1150000) {
  return {
    status: 200,
    data: {
      product: {
        id: 12345,
        default_variant: {
          color: { title: color },
          price: { selling_price: sellingPrice },
        },
      },
    },
  };
}

function mockFetch(payload: any, product = productPayload()) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('price-chart')) {
      return jsonResponse(payload);
    }
    return jsonResponse(product);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('parsePriceChartPayload', () => {
  it('normalizes groups, prices, sellers and availability', () => {
    const parsed = parsePriceChartPayload(chartPayload(), SOURCE);

    expect(parsed.today).toBe('2026-11-14');
    expect(parsed.selectionTitle).toBe('انتخاب رنگ');
    expect(parsed.groups).toHaveLength(2);

    const [black, white] = parsed.groups;
    expect(black.title).toBe('مشکی');
    expect(black.points).toHaveLength(3);
    expect(black.points[0]).toMatchObject({
      day: '1405/08/20',
      observedAt: '2026-11-11T12:00:00.000Z',
      priceIrr: 1000000,
      rrpPriceIrr: 1200000,
      seller: 'فروشنده الف',
      availability: 'in_stock',
      isMarketable: true,
      warranty: 'گارانتی اصلی',
    });
    expect(black.points[2].availability).toBe('out_of_stock');
    expect(white.points[0].priceIrr).toBe(900000);
    expect(white.points[0].warranty).toBeNull();
  });

  it('applies the source price multiplier', () => {
    const parsed = parsePriceChartPayload(chartPayload(), { ...SOURCE, price_multiplier: 10 });
    expect(parsed.groups[0].points[0].priceIrr).toBe(10000000);
  });

  it('returns no groups for empty or malformed payloads', () => {
    expect(parsePriceChartPayload({ data: { price_chart: [] } }, SOURCE).groups).toHaveLength(0);
    expect(parsePriceChartPayload({}, SOURCE).groups).toHaveLength(0);
    expect(parsePriceChartPayload(null, SOURCE).groups).toHaveLength(0);
  });
});

describe('pickPriceChartGroup', () => {
  const parsed = () => parsePriceChartPayload(chartPayload(), SOURCE).groups;

  it('uses the only group when there is no choice', () => {
    const groups = parsed().slice(0, 1);
    expect(pickPriceChartGroup(groups)?.title).toBe('مشکی');
  });

  it('matches the default variant colour', () => {
    expect(pickPriceChartGroup(parsed(), { colorTitle: 'سفید' })?.title).toBe('سفید');
  });

  it('falls back to the price closest to the current selling price', () => {
    expect(pickPriceChartGroup(parsed(), { currentPriceIrr: 880000 })?.title).toBe('سفید');
    expect(pickPriceChartGroup(parsed(), { currentPriceIrr: 1140000 })?.title).toBe('مشکی');
  });

  it('falls back to the first group when nothing matches', () => {
    expect(pickPriceChartGroup(parsed(), { colorTitle: 'قرمز' })?.title).toBe('مشکی');
  });
});

describe('backfillDigikalaPriceHistory', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
  });

  it('writes one snapshot per day for a new Digikala product', async () => {
    const fetchMock = mockFetch(chartPayload());

    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(result).toMatchObject({ inserted: 3, skipped: 0, groups: 2 });
    // one price-chart request + one product request to pick the right group
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(priceChartApiUrl('12345'));

    const rows = db
      .prepare('SELECT * FROM price_snapshots WHERE product_key = ? ORDER BY observed_at ASC')
      .all('product-a') as any[];

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.observed_at)).toEqual([
      '2026-11-11T12:00:00.000Z',
      '2026-11-12T12:00:00.000Z',
      '2026-11-13T12:00:00.000Z',
    ]);
    expect(rows.map((r) => r.price_irr)).toEqual([1000000, 1100000, 1150000]);
    expect(rows[2].availability).toBe('out_of_stock');
    expect(JSON.parse(rows[0].raw_observation).backfill).toBe(true);

    const run = db.prepare("SELECT * FROM runs WHERE trigger_source = 'backfill'").get() as any;
    expect(run).toBeTruthy();
    expect(rows.every((r) => r.run_id === run.id)).toBe(true);
  });

  it('does not fetch again or duplicate days when the product already has history', async () => {
    mockFetch(chartPayload());
    await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    const fetchMock = mockFetch(chartPayload());
    const second = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(second.reason).toBe('no_new_days');
    expect(second.inserted).toBe(0);
    const chartCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('price-chart')
    );
    expect(chartCalls).toHaveLength(1);

    const count = db
      .prepare('SELECT COUNT(*) AS cnt FROM price_snapshots WHERE product_key = ?')
      .get('product-a') as { cnt: number };
    expect(count.cnt).toBe(3);
  });

  it('skips days we already collected ourselves', async () => {
    db.prepare(`
      INSERT INTO runs (started_at, status, config_path, target_count, success_count, error_count)
      VALUES ('2026-11-12T08:00:00.000Z', 'success', NULL, 1, 1, 0)
    `).run();
    const runId = (db.prepare('SELECT id FROM runs LIMIT 1').get() as { id: number }).id;
    db.prepare(`
      INSERT INTO price_snapshots (run_id, product_key, source_key, url, title, seller, price_irr, availability, observed_at, raw_observation)
      VALUES (?, 'product-a', 'digikala_api', 'https://www.digikala.com/product/dkp-12345/', NULL, NULL, 500000, 'in_stock', '2026-11-12T09:00:00.000Z', '{}')
    `).run(runId);

    mockFetch(chartPayload());
    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(1);

    const days = (
      db
        .prepare('SELECT substr(observed_at, 1, 10) AS day FROM price_snapshots WHERE product_key = ? ORDER BY day')
        .all('product-a') as Array<{ day: string }>
    ).map((r) => r.day);
    expect(days).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('never throws when the upstream request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"status":429}', { status: 429 }))
    );

    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(result.reason).toBe('fetch_failed');
    expect(result.inserted).toBe(0);
  });

  it('ignores non-Digikala sources and URLs without a product id', async () => {
    addManagedSource(db, { key: 'servix_market', adapter: 'servix_market' });
    const fetchMock = mockFetch(chartPayload());

    const market = await backfillDigikalaPriceHistory(db, {
      productKey: 'usd',
      url: 'https://api.servix.net/api/currency',
      sourceKey: 'servix_market',
    });
    expect(market.reason).toBe('unsupported_source');

    const noId = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-b',
      url: 'https://www.digikala.com/',
      sourceKey: 'digikala_api',
    });
    expect(noId.reason).toBe('no_product_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the configured source multiplier and headers', async () => {
    updateManagedSource(db, 'digikala_web', {
      price_multiplier: 10,
      headers: { 'X-Test': 'yes' },
    });
    expect(getSourcesMap(db).digikala_web.price_multiplier).toBe(10);

    const fetchMock = mockFetch(chartPayload());
    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-c',
      url: 'https://www.digikala.com/product/dkp-999/',
      sourceKey: 'digikala_web',
    });

    expect(result.inserted).toBe(3);
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('X-Test')).toBe('yes');
    expect(headers.get('Referer')).toBe('https://www.digikala.com/');

    const row = db
      .prepare('SELECT price_irr FROM price_snapshots WHERE product_key = ? ORDER BY observed_at ASC LIMIT 1')
      .get('product-c') as { price_irr: number };
    expect(row.price_irr).toBe(10000000);
  });
});
