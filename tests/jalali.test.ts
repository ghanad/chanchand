import { describe, it, expect } from 'vitest';
import {
  jalaliToGregorian,
  jalaliDateToIso,
  parseJalaliDate,
} from '../src/lib/jalali';

describe('jalali calendar', () => {
  it('converts known Jalali dates to Gregorian', () => {
    expect(jalaliToGregorian(1404, 1, 1)).toEqual({ gy: 2025, gm: 3, gd: 21 });
    expect(jalaliToGregorian(1403, 1, 1)).toEqual({ gy: 2024, gm: 3, gd: 20 });
    expect(jalaliToGregorian(1400, 1, 1)).toEqual({ gy: 2021, gm: 3, gd: 21 });
    expect(jalaliToGregorian(1405, 7, 23)).toEqual({ gy: 2026, gm: 10, gd: 15 });
    expect(jalaliToGregorian(1405, 8, 22)).toEqual({ gy: 2026, gm: 11, gd: 13 });
  });

  it('parses slash, dash and Persian-digit dates', () => {
    expect(parseJalaliDate('1405/07/23')).toEqual({ year: 1405, month: 7, day: 23 });
    expect(parseJalaliDate('1405-7-23')).toEqual({ year: 1405, month: 7, day: 23 });
    expect(parseJalaliDate('۱۴۰۵/۰۸/۲۲')).toEqual({ year: 1405, month: 8, day: 22 });
  });

  it('rejects malformed and out-of-range values', () => {
    expect(parseJalaliDate('')).toBeNull();
    expect(parseJalaliDate(null)).toBeNull();
    expect(parseJalaliDate('2026-11-14')).toBeNull();
    expect(parseJalaliDate('1405/13/01')).toBeNull();
    expect(parseJalaliDate('1405/00/10')).toBeNull();
  });

  it('builds UTC ISO timestamps on the right calendar day', () => {
    expect(jalaliDateToIso('1405/08/22')).toBe('2026-11-13T12:00:00.000Z');
    expect(jalaliDateToIso('1405/08/22', 0)).toBe('2026-11-13T00:00:00.000Z');
    expect(jalaliDateToIso('not-a-date')).toBeNull();
  });
});
