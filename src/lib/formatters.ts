import { Availability, RunStatus, PriceRow } from "../types/dashboard";

export const numberFormatter = new Intl.NumberFormat("fa-IR");

export const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : numberFormatter.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
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
