import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDate,
  formatDateOnly,
  formatTimeOnly,
  splitDateTime,
  PERSIAN_COMMA,
  productLinkUrl,
  priceAxisDomain,
  availabilityText,
  statusText,
  formatPercentChange,
  formatPriceAxis,
} from '../src/lib/formatters';

describe('formatters module', () => {
  describe('formatNumber', () => {
    it('returns "-" for null or undefined', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
    });

    it('formats numbers into Persian digits with separators', () => {
      const formatted = formatNumber(12500000);
      expect(formatted).not.toBe('-');
      // Must contain localized grouping or digits
      expect(formatted).toMatch(/[۰-۹]/);
    });
  });

  describe('formatDate', () => {
    it('returns "-" for empty or invalid date', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
      expect(formatDate('')).toBe('-');
    });

    it('formats ISO dates correctly into localized date-time', () => {
      const result = formatDate('2026-10-23T12:00:00.000Z');
      expect(result).not.toBe('-');
      expect(result.length).toBeGreaterThan(3);
      // Uses Persian comma and never ASCII comma
      expect(result).toContain(PERSIAN_COMMA);
      expect(result).not.toContain(',');
    });

    it('formats time in 24-hour format without ambiguous 12-hour values', () => {
      // 20:30 UTC -> will have evening hours in any timezone
      const eveningDate = new Date('2026-10-23T20:30:00.000Z');
      const formatted = formatDate(eveningDate.toISOString());
      // Should not contain AM/PM suffixes
      expect(formatted).not.toContain('AM');
      expect(formatted).not.toContain('PM');
      expect(formatted).not.toContain('قبل‌ازظهر');
      expect(formatted).not.toContain('بعدازظهر');
    });

    it('supports custom separator like dash', () => {
      const result = formatDate('2026-10-23T12:00:00.000Z', ' -');
      expect(result).toContain(' - ');
      expect(result).not.toContain(PERSIAN_COMMA);
    });

    it('returns raw string if not parsable as valid date', () => {
      expect(formatDate('not-a-valid-date')).toBe('not-a-valid-date');
    });

    it('splitDateTime splits valid date into date and time parts correctly', () => {
      const parts = splitDateTime('2026-10-23T12:00:00.000Z');
      expect(parts).not.toBeNull();
      expect(parts?.date).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
      expect(parts?.time).toMatch(/^[۰-۹]{2}:[۰-۹]{2}$/);
      expect(splitDateTime(null)).toBeNull();
      expect(splitDateTime('invalid')).toBeNull();
    });

    it('formatDateOnly and formatTimeOnly return isolated strings', () => {
      const dateOnly = formatDateOnly('2026-10-23T12:00:00.000Z');
      expect(dateOnly).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
      expect(formatDateOnly(null)).toBe('-');

      const timeOnly = formatTimeOnly('2026-10-23T12:00:00.000Z');
      expect(timeOnly).toMatch(/^[۰-۹]{2}:[۰-۹]{2}$/);
      expect(formatTimeOnly(null)).toBe('-');
    });
  });

  describe('productLinkUrl', () => {
    it('returns valid http/https URLs', () => {
      expect(productLinkUrl({ url: 'https://www.digikala.com/product/dkp-123' })).toBe(
        'https://www.digikala.com/product/dkp-123'
      );
      expect(productLinkUrl({ url: 'http://example.com/shop' })).toBe('http://example.com/shop');
    });

    it('filters out api.brsapi.ir internal endpoints', () => {
      expect(productLinkUrl({ url: 'https://api.brsapi.ir/v1/gold' })).toBeNull();
    });

    it('filters out javascript and invalid protocols', () => {
      expect(productLinkUrl({ url: 'javascript:alert(1)' })).toBeNull();
      expect(productLinkUrl({ url: 'ftp://files.com' })).toBeNull();
      expect(productLinkUrl({ url: 'invalid-url' })).toBeNull();
      expect(productLinkUrl({ url: '' })).toBeNull();
    });
  });

  describe('priceAxisDomain', () => {
    it('calculates domain with padding for spread prices', () => {
      const data = [{ price: 100 }, { price: 200 }];
      const [min, max] = priceAxisDomain(data);
      // spread = 100, padding = 15. min = 85, max = 215
      expect(min).toBe(85);
      expect(max).toBe(215);
    });

    it('handles identical prices safely without collapsing domain', () => {
      const data = [{ price: 1000 }, { price: 1000 }];
      const [min, max] = priceAxisDomain(data);
      expect(min).toBeLessThan(1000);
      expect(max).toBeGreaterThan(1000);
    });

    it('ensures min domain is never negative', () => {
      const data = [{ price: 5 }, { price: 10 }];
      const [min, max] = priceAxisDomain(data);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeGreaterThan(10);
    });
  });

  describe('availabilityText and statusText', () => {
    it('translates availability states to Persian', () => {
      expect(availabilityText('in_stock')).toBe('موجود');
      expect(availabilityText('out_of_stock')).toBe('ناموجود');
      expect(availabilityText('unknown')).toBe('نامشخص');
    });

    it('translates run statuses to Persian', () => {
      expect(statusText('success')).toBe('موفق');
      expect(statusText('failed')).toBe('ناموفق');
      expect(statusText('partial')).toBe('نیمه‌کامل');
      expect(statusText('running')).toBe('در حال اجرا');
      expect(statusText(null)).toBe('-');
    });
  });

  describe('formatPercentChange', () => {
    it('returns "-" for null or undefined', () => {
      expect(formatPercentChange(null)).toBe('-');
      expect(formatPercentChange(undefined)).toBe('-');
    });

    it('formats 0% properly', () => {
      expect(formatPercentChange(0)).toBe('۰٪');
    });

    it('formats positive and negative percentages using absolute Persian number', () => {
      expect(formatPercentChange(5)).toBe('۵٪');
      expect(formatPercentChange(-5)).toBe('۵٪');
      expect(formatPercentChange(2.5)).toMatch(/[۰-۹]/);
      expect(formatPercentChange(2.5)).toContain('٪');
    });
  });

  describe('formatPriceAxis', () => {
    it('returns "-" for null, undefined or NaN', () => {
      expect(formatPriceAxis(null)).toBe('-');
      expect(formatPriceAxis(undefined)).toBe('-');
      expect(formatPriceAxis(NaN)).toBe('-');
    });

    it('formats values under 100k normally without abbreviation', () => {
      const formatted = formatPriceAxis(50000);
      expect(formatted).not.toContain('هزار');
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it('formats values in millions with Persian million abbreviation', () => {
      const formatted = formatPriceAxis(2631545);
      expect(formatted).toContain('میلیون');
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it('formats values in billions with Persian billion abbreviation', () => {
      const formatted = formatPriceAxis(4299250000);
      expect(formatted).toContain('میلیارد');
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it('adapts precision when domain spread is small to prevent identical ticks', () => {
      const tick1 = formatPriceAxis(4210750000, 80000000);
      const tick2 = formatPriceAxis(4245750000, 80000000);
      expect(tick1).not.toBe(tick2);
    });
  });
});
