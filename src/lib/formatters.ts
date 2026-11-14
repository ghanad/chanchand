import { Availability, RunStatus, PriceRow } from "../types/dashboard";

export const numberFormatter = new Intl.NumberFormat("fa-IR");

export const dateOnlyFormatter = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const timeOnlyFormatter = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  hour12: false,
});

export const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  hour12: false,
});

export const PERSIAN_COMMA = "،";

export interface DateTimeParts {
  date: string;
  time: string;
}

export function splitDateTime(value: string | null | undefined): DateTimeParts | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date: dateOnlyFormatter.format(date),
    time: timeOnlyFormatter.format(date),
  };
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : numberFormatter.format(value);
}

/** Formats a weight in grams of 18K gold, keeping up to four decimals. */
export function formatGoldGram(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

/**
 * Axis tick formatter for gram values, selecting decimals based on the domain
 * spread so sub-gram values do not collapse into identical labels.
 */
export function formatGoldGramAxis(
  value: number | null | undefined,
  spread?: number
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const num = Number(value);
  const magnitude = Math.max(Math.abs(num), spread && spread > 0 ? spread : 0);
  const maxFractionDigits = magnitude >= 10 ? 2 : magnitude >= 1 ? 2 : magnitude >= 0.1 ? 3 : 4;
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: maxFractionDigits }).format(num);
}

/** Domain for the grams-of-gold chart, rounded with sub-gram precision. */
export function goldGramAxisDomain(rows: Array<{ price: number }>): [number, number] {
  const prices = rows.map((row) => row.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;
  const padding = spread > 0 ? spread * 0.15 : Math.max(max * 0.05, 0.0001);
  const factor = max >= 10 ? 100 : max >= 1 ? 1000 : 10000;

  return [
    Math.max(0, Math.floor((min - padding) * factor) / factor),
    Math.ceil((max + padding) * factor) / factor,
  ];
}

export function formatPercentChange(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return "-";
  const abs = Math.abs(percent);
  if (abs === 0) return "۰٪";
  const maxDecimals = abs < 0.1 ? 2 : 1;
  const formatted = new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(abs);
  return `${formatted}٪`;
}

export function formatDate(value: string | null | undefined, separator: string = PERSIAN_COMMA): string {
  if (!value) return "-";
  const parts = splitDateTime(value);
  if (!parts) return value;
  return `${parts.date}${separator} ${parts.time}`;
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateOnlyFormatter.format(date);
}

export function formatTimeOnly(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : timeOnlyFormatter.format(date);
}

export function productLinkUrl(row: Pick<PriceRow, "url">): string | null {
  if (!row.url) return null;

  try {
    const url = new URL(row.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname === "api.brsapi.ir") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function priceAxisDomain(rows: Array<{ price: number }>): [number, number] {
  const prices = rows.map((row) => row.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;
  const padding = spread > 0 ? spread * 0.15 : Math.max(max * 0.05, 1);

  return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
}

export function formatPriceAxis(value: number | null | undefined, spread?: number): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const num = Number(value);
  const abs = Math.abs(num);

  // If value is small (< 100,000, e.g. USD prices or sub-100k toman), format normally with commas
  if (abs < 100_000) {
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(num);
  }

  // Determine needed fraction digits based on domain spread to avoid identical tick labels
  let maxDigits = 2;
  if (spread !== undefined && spread > 0) {
    if (abs >= 1_000_000_000) {
      maxDigits = spread < 50_000_000 ? 3 : 2;
    } else if (abs >= 1_000_000) {
      maxDigits = spread < 50_000 ? 3 : 2;
    }
  }

  return new Intl.NumberFormat("fa-IR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: maxDigits,
  }).format(num);
}

export function availabilityText(value: Availability): string {
  const labels: Record<string, string> = {
    in_stock: "موجود",
    out_of_stock: "ناموجود",
    unknown: "نامشخص",
  };
  return labels[value] || value || "-";
}

export function statusText(value: RunStatus | null | undefined): string {
  const labels: Record<string, string> = {
    success: "موفق",
    failed: "ناموفق",
    partial: "نیمه‌کامل",
    running: "در حال اجرا",
  };
  return value ? labels[value] || value : "-";
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return "-";
  if (ms < 1000) return `${formatNumber(ms)} میلی‌ثانیه`;
  const seconds = (ms / 1000).toFixed(1);
  return `${formatNumber(Number(seconds))} ثانیه`;
}

export function triggerSourceText(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    cron: "کرون (Cron)",
    api: "فراخوانی API",
    manual: "دستی (پنل ادمین)",
    product_refresh: "بروزرسانی تکی محصول",
    cli: "خط فرمان (CLI)",
  };
  return value ? labels[value] || value : "نامشخص";
}

