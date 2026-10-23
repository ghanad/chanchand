import { describe, it, expect } from 'vitest';
import { normalizeDigits, parsePriceToIrr, detectAvailability } from '../src/lib/pricing';

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
