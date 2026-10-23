import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDate,
  productLinkUrl,
  priceAxisDomain,
  availabilityText,
  statusText,
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
    });

    it('returns raw string if not parsable as valid date', () => {
      expect(formatDate('not-a-valid-date')).toBe('not-a-valid-date');
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
});
