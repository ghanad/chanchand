import { describe, it, expect } from 'vitest';
import { normalizeDigits, parsePriceToIrr, detectAvailability } from '../src/lib/pricing';
import { usdRateFor } from '../src/lib/serializers';

describe('pricing module', () => {
  it('normalizes Persian and Arabic digits', () => {
    expect(normalizeDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
    expect(normalizeDigits('قیمت ۱۲,۵۰۰ تومان')).toBe('قیمت 12,500 تومان');
  });

  it('parses price to IRR correctly', () => {
    expect(parsePriceToIrr(null)).toBeNull();
    expect(parsePriceToIrr(12000)).toBe(12000);
    expect(parsePriceToIrr(12000, 10)).toBe(120000);
    expect(parsePriceToIrr('۱۲,۵۰۰,۰۰۰ تومان', 10)).toBe(125000000);
    expect(parsePriceToIrr('5000 ریال')).toBe(5000);
    expect(parsePriceToIrr('رایگان')).toBeNull();
  });

  it('detects availability tokens', () => {
    expect(detectAvailability('ناموجود')).toBe('out_of_stock');
    expect(detectAvailability('موجود در انبار')).toBe('in_stock');
    expect(detectAvailability('اتمام موجودی')).toBe('out_of_stock');
    expect(detectAvailability('آماده ارسال')).toBe('in_stock');
    expect(detectAvailability('')).toBe('unknown');
    expect(detectAvailability('نامشخص')).toBe('unknown');
  });
});

describe('usdRateFor and serializeHistoryPrices', () => {
  const makeSnapshot = (observed_at: string, price_irr: number) => ({
    id: 1,
    run_id: 1,
    product_key: 'usd',
    source_key: 'brsapi_market',
    url: 'http://test',
    title: 'USD',
    seller: null,
    price_irr,
    availability: 'in_stock' as const,
    observed_at,
    raw_observation: '{}',
  });

  it('selects the closest USD rate in time instead of a 3-month-old rate', () => {
    const productSnapshot = {
      ...makeSnapshot('2026-10-23T08:56:00.000Z', 503000000),
      product_key: 'air-purifier',
    };

    const usdThreeMonthsAgo = makeSnapshot('2026-07-23T08:56:00.000Z', 1724000); // 3 months ago
    const usdTwoHoursLater = makeSnapshot('2026-10-23T10:56:00.000Z', 2500000); // 2 hours later

    // Under the bug, usdThreeMonthsAgo was picked because latestBefore was preferred
    const chosenRate = usdRateFor(productSnapshot, [usdThreeMonthsAgo, usdTwoHoursLater]);
    expect(chosenRate).toBe(2500000);
  });

  it('selects latestBefore if it is closer than firstAfter', () => {
    const productSnapshot = {
      ...makeSnapshot('2026-10-23T08:56:00.000Z', 503000000),
      product_key: 'air-purifier',
    };

    const usdOneHourAgo = makeSnapshot('2026-10-23T07:56:00.000Z', 2450000); // 1 hour ago
    const usdFiveHoursLater = makeSnapshot('2026-10-23T13:56:00.000Z', 2550000); // 5 hours later

    const chosenRate = usdRateFor(productSnapshot, [usdOneHourAgo, usdFiveHoursLater]);
    expect(chosenRate).toBe(2450000);
  });

  it('respects maxToleranceMs if provided', () => {
    const productSnapshot = {
      ...makeSnapshot('2026-10-23T08:56:00.000Z', 503000000),
      product_key: 'air-purifier',
    };

    const usdThreeMonthsAgo = makeSnapshot('2026-07-23T08:56:00.000Z', 1724000);
    // Tolerance is 24 hours (86,400,000 ms), but rate is 90 days away
    const chosenRate = usdRateFor(productSnapshot, [usdThreeMonthsAgo], 24 * 60 * 60 * 1000);
    expect(chosenRate).toBeNull();
  });
});

