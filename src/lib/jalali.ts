/**
 * Minimal Jalali (Solar Hijri) -> Gregorian conversion.
 *
 * Digikala's price-chart endpoint returns one row per day with a Jalali `day`
 * (e.g. `1405/07/23`), while snapshots are stored with ISO `observed_at`
 * timestamps. This module implements the well-known jalaali algorithm so the
 * backfill can place each historical point on the right calendar day without
 * pulling in a dependency.
 */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

interface JalCalResult {
  leap?: number;
  gy: number;
  march: number;
}

function jalCal(jy: number, withoutLeap = false): JalCalResult {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new Error(`Jalali year out of supported range: ${jy}`);
  }

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (withoutLeap) return { gy, march };

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

/** Converts a Jalali date to its Gregorian equivalent. */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

/**
 * Parses `1405/07/23`, `1405-7-23` or Persian-digit variants.
 * Returns `null` for anything that is not a plausible Jalali date.
 */
export function parseJalaliDate(value: string | null | undefined): JalaliDate | null {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  const match = normalized.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Contemporary Jalali years only; this also rejects Gregorian-looking input
  // such as `2026-11-14` instead of silently treating it as year 2026.
  if (year < 1200 || year > 1600) return null;

  return { year, month, day };
}

/**
 * Converts a Jalali day string to a UTC ISO timestamp at `utcHour` (default
 * noon UTC, i.e. mid-afternoon in Tehran) so a day's snapshot sorts after the
 * previous day's and before the next one.
 */
export function jalaliDateToIso(value: string | null | undefined, utcHour = 12): string | null {
  const parsed = parseJalaliDate(value);
  if (!parsed) return null;

  let gregorian: { gy: number; gm: number; gd: number };
  try {
    gregorian = jalaliToGregorian(parsed.year, parsed.month, parsed.day);
  } catch {
    return null;
  }

  const hour = Math.max(0, Math.min(23, Math.trunc(utcHour)));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${gregorian.gy}-${pad(gregorian.gm)}-${pad(gregorian.gd)}T${pad(hour)}:00:00.000Z`;
}
