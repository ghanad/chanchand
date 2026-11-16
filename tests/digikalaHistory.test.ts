import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, addManagedSource, updateManagedSource, getSourcesMap } from '../src/lib/db';
import {
  parsePriceChartPayload,
  selectChartSeries,
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

/**
 * Two colours, several sellers each. Cheapest overall is the white offer at
 * 900,000; the cheapest black offer is 1,100,000.
 */
function productPayload(floorPrice = 900000) {
  return {
    status: 200,
    data: {
      product: {
        id: 12345,
        title_fa: 'هدفون بی‌سیم',
        variants: [
          {
            id: 11,
            color: { id: 0, title: 'مشکی' },
            status: 'marketable',
            seller: { title: 'فروشنده الف' },
            price: { selling_price: 1100000 },
          },
          {
            id: 12,
            color: { id: 0, title: 'مشکی' },
            status: 'marketable',
            seller: { title: 'فروشنده ب' },
            price: { selling_price: 1200000 },
          },
          {
            id: 13,
            color: { id: 1, title: 'سفید' },
            status: 'marketable',
            seller: { title: 'فروشنده ج' },
            price: { selling_price: floorPrice },
          },
          {
            id: 14,
            color: { id: 1, title: 'سفید' },
            status: 'not_marketable',
            seller: { title: 'فروشنده د' },
            price: { selling_price: 950000 },
          },
        ],
        default_variant: {
          id: 11,
          color: { id: 0, title: 'مشکی' },
          status: 'marketable',
          price: { selling_price: 1100000 },
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

describe('selectChartSeries', () => {
  const groups = () => parsePriceChartPayload(chartPayload(), SOURCE).groups;

  it('builds the floor series from the cheapest marketable colour of each day', () => {
    const series = selectChartSeries(groups());
    expect(series?.kind).toBe('floor');
    expect(series?.points.map((p) => [p.day, p.priceIrr])).toEqual([
      ['1405/08/20', 1000000],
      ['1405/08/21', 1100000],
      // black is not marketable on 08/22, so the white offer wins that day
      ['1405/08/22', 900000],
    ]);
  });

  it('selects a colour by its label', () => {
    const series = selectChartSeries(groups(), { colorId: '1', colorLabel: 'سفید' });
    expect(series?.kind).toBe('color');
    expect(series?.label).toBe('سفید');
    expect(series?.points).toHaveLength(1);
  });

  it('never lets a positional chart-group id override a different colour label', () => {
    // chart group id 1 is "سفید" while colour id 1 is "مشکی"
    const series = selectChartSeries(groups(), { colorId: '1', colorLabel: 'مشکی' });
    expect(series?.label).toBe('مشکی');
  });

  it('returns null when the requested colour has no chart line', () => {
    expect(selectChartSeries(groups(), { colorId: '99', colorLabel: 'قرمز' })).toBeNull();
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

  it('imports the floor series for a new product, skipping today', async () => {
    const fetchMock = mockFetch(chartPayload());

    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(result).toMatchObject({ inserted: 2, skipped: 1, groups: 2 });
    // one price-chart request + one product request to resolve the live price
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(priceChartApiUrl('12345'));

    const rows = db
      .prepare('SELECT * FROM price_snapshots WHERE product_key = ? ORDER BY observed_at ASC')
      .all('product-a') as any[];

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.observed_at)).toEqual([
      '2026-11-11T12:00:00.000Z',
      '2026-11-12T12:00:00.000Z',
    ]);
    expect(rows.map((r) => r.price_irr)).toEqual([1000000, 1100000]);

    const raw = JSON.parse(rows[0].raw_observation);
    expect(raw.backfill).toBe(true);
    expect(raw.chart_kind).toBe('floor');
    expect(raw.color_id).toBeNull();

    const run = db.prepare("SELECT * FROM runs WHERE trigger_source = 'backfill'").get() as any;
    expect(run).toBeTruthy();
    expect(rows.every((r) => r.run_id === run.id)).toBe(true);
  });

  it('imports only the chosen colour when a colour is pinned', async () => {
    mockFetch(chartPayload());

    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-black',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
      colorId: '0',
      colorLabel: 'مشکی',
    });

    expect(result.inserted).toBe(2);
    const rows = db
      .prepare('SELECT price_irr, raw_observation FROM price_snapshots WHERE product_key = ? ORDER BY observed_at ASC')
      .all('product-black') as any[];
    expect(rows.map((r) => r.price_irr)).toEqual([1000000, 1100000]);
    const raw = JSON.parse(rows[0].raw_observation);
    expect(raw.chart_kind).toBe('color');
    expect(raw.color_id).toBe('0');
    expect(raw.color_label).toBe('مشکی');
  });

  it('refuses to import a chart whose level does not match the live price', async () => {
    mockFetch(chartPayload(), productPayload(2000000));

    const result = await backfillDigikalaPriceHistory(db, {
      productKey: 'product-a',
      url: 'https://www.digikala.com/product/dkp-12345/',
      sourceKey: 'digikala_api',
    });

    expect(result.reason).toBe('chart_mismatch');
    expect(result.inserted).toBe(0);
    const count = db
      .prepare('SELECT COUNT(*) AS cnt FROM price_snapshots WHERE product_key = ?')
      .get('product-a') as { cnt: number };
    expect(count.cnt).toBe(0);
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
    expect(count.cnt).toBe(2);
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

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);

    const days = (
      db
        .prepare('SELECT substr(observed_at, 1, 10) AS day FROM price_snapshots WHERE product_key = ? ORDER BY day')
        .all('product-a') as Array<{ day: string }>
    ).map((r) => r.day);
    expect(days).toEqual(['2026-11-11', '2026-11-12']);
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

    expect(result.inserted).toBe(2);
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('X-Test')).toBe('yes');
    expect(headers.get('Referer')).toBe('https://www.digikala.com/');

    const row = db
      .prepare('SELECT price_irr FROM price_snapshots WHERE product_key = ? ORDER BY observed_at ASC LIMIT 1')
      .get('product-c') as { price_irr: number };
    expect(row.price_irr).toBe(10000000);
  });
});
