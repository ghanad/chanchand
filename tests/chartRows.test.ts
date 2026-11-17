import { describe, it, expect } from 'vitest';
import type { PriceRow } from '../src/types/dashboard';
import {
  buildChartRows,
  countPricedPoints,
  hasOutOfStockPoints,
  pricedPoints,
} from '../src/lib/chartRows';
import { formatDate, priceAxisDomain } from '../src/lib/formatters';

function priceRow(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    id: 1,
    run_id: 1,
    product_key: 'test-product',
    source_key: 'digikala_api',
    url: 'https://example.com/product',
    title: null,
    seller: null,
    price_irr: 1_000_000,
    price_toman: 100_000,
    previous_price_irr: null,
    previous_price_toman: null,
    previous_observed_at: null,
    diff_toman: null,
    diff_percent: null,
    price_usd: 10,
    usd_rate_irr: null,
    usd_rate_toman: null,
    price_gold_gram: 0.5,
    gold_rate_irr: null,
    gold_rate_toman: null,
    availability: 'in_stock',
    observed_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildChartRows', () => {
  it('keeps in-stock snapshots with a finite price', () => {
    const rows = buildChartRows([priceRow()], 'price_toman');

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(100_000);
    expect(rows[0].reason).toBeNull();
    expect(rows[0].time).toBe(formatDate('2026-01-01T10:00:00.000Z'));
    expect(rows[0].source).toBe('digikala_api');
  });

  it('keeps an out-of-stock snapshot as a null point so the line breaks', () => {
    const rows = buildChartRows(
      [priceRow({ availability: 'out_of_stock', price_irr: null, price_toman: null })],
      'price_toman'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBeNull();
    expect(rows[0].reason).toBe('out_of_stock');
  });

  it('ignores a stale price scraped from an out-of-stock page', () => {
    // generic_html can report out_of_stock while still parsing a price.
    const rows = buildChartRows(
      [priceRow({ availability: 'out_of_stock', price_toman: 90_000 })],
      'price_toman'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBeNull();
    expect(rows[0].reason).toBe('out_of_stock');
  });

  it('plots snapshots whose availability is unknown', () => {
    const rows = buildChartRows([priceRow({ availability: 'unknown' })], 'price_toman');

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(100_000);
    expect(rows[0].reason).toBeNull();
  });

  it('drops in-stock rows whose metric is missing (e.g. no USD rate)', () => {
    const rows = buildChartRows(
      [priceRow({ price_usd: null }), priceRow({ id: 2, observed_at: '2026-01-02T10:00:00.000Z' })],
      'price_usd'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(10);
  });

  it('preserves chronological order and mixes priced and unavailable points', () => {
    const rows = buildChartRows(
      [
        priceRow({ id: 1, observed_at: '2026-01-01T10:00:00.000Z' }),
        priceRow({
          id: 2,
          observed_at: '2026-01-02T10:00:00.000Z',
          availability: 'out_of_stock',
          price_toman: null,
        }),
        priceRow({ id: 3, observed_at: '2026-01-03T10:00:00.000Z', price_toman: 120_000 }),
      ],
      'price_toman'
    );

    expect(rows.map((r) => r.price)).toEqual([100_000, null, 120_000]);
    expect(countPricedPoints(rows)).toBe(2);
    expect(hasOutOfStockPoints(rows)).toBe(true);
  });

  it('reports an all-unavailable range as having no priced points', () => {
    const rows = buildChartRows(
      [
        priceRow({ availability: 'out_of_stock', price_toman: null }),
        priceRow({ id: 2, availability: 'out_of_stock', price_toman: null }),
      ],
      'price_toman'
    );

    expect(rows).toHaveLength(2);
    expect(countPricedPoints(rows)).toBe(0);
    expect(hasOutOfStockPoints(rows)).toBe(true);
  });

  it('feeds only priced points into the axis domain (null must not become 0)', () => {
    const rows = buildChartRows(
      [
        priceRow({ observed_at: '2026-01-01T10:00:00.000Z', price_toman: 100_000 }),
        priceRow({
          id: 2,
          observed_at: '2026-01-02T10:00:00.000Z',
          availability: 'out_of_stock',
          price_toman: null,
        }),
        priceRow({ id: 3, observed_at: '2026-01-03T10:00:00.000Z', price_toman: 200_000 }),
      ],
      'price_toman'
    );

    const [min, max] = priceAxisDomain(pricedPoints(rows));

    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(100_000);
    expect(max).toBeGreaterThan(200_000);
  });
});
