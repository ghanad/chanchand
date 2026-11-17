import type { PriceRow } from "@/types/dashboard";
import { formatDate } from "@/lib/formatters";

export type ChartMetricKey = "price_toman" | "price_usd" | "price_gold_gram";

/**
 * Why a chart point has no price:
 * - `out_of_stock`: the product was explicitly reported as unavailable, so the
 *   chart must show a real gap instead of connecting prices across that period.
 * A point with a finite price always has `reason: null`.
 */
export type ChartPointReason = "out_of_stock" | null;

export interface ChartPoint {
  time: string;
  source: string;
  price: number | null;
  reason: ChartPointReason;
}

/**
 * Builds the series plotted by the product price chart.
 *
 * Rules:
 * - An explicit `out_of_stock` snapshot is kept as a `null` point so the line
 *   breaks there. The stored price is ignored on purpose: some adapters (e.g.
 *   generic HTML) can still scrape a stale price from a page that says the item
 *   is unavailable, and plotting it would lie about the market.
 * - A row whose price is missing for any other reason (typically the USD/gold
 *   rate was not collected around that time) is dropped, exactly like before.
 *   Keeping those as gaps would fill the USD/gold charts with breaks that have
 *   nothing to do with availability.
 */
export function buildChartRows(history: PriceRow[], metricKey: ChartMetricKey): ChartPoint[] {
  const points: ChartPoint[] = [];

  for (const row of history) {
    const time = formatDate(row.observed_at);

    if (row.availability === "out_of_stock") {
      points.push({ time, source: row.source_key, price: null, reason: "out_of_stock" });
      continue;
    }

    const price = row[metricKey];
    if (price === null || price === undefined || !Number.isFinite(price)) continue;

    points.push({ time, source: row.source_key, price: Number(price), reason: null });
  }

  return points;
}

/** Points that carry a real price; safe to feed into axis-domain helpers. */
export function pricedPoints(rows: ChartPoint[]): Array<ChartPoint & { price: number }> {
  return rows.filter(
    (row): row is ChartPoint & { price: number } =>
      row.price !== null && Number.isFinite(row.price)
  );
}

export function countPricedPoints(rows: ChartPoint[]): number {
  return pricedPoints(rows).length;
}

export function hasOutOfStockPoints(rows: ChartPoint[]): boolean {
  return rows.some((row) => row.reason === "out_of_stock");
}
