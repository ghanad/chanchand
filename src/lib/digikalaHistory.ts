import Database from 'better-sqlite3';
import { PriceObservation, SourceConfig, TargetConfig } from './types';
import { extractProductId } from './adapters/digikalaApi';
import { fetchWithCookieRedirect } from './adapters/fetchUtils';
import { getSourcesMap } from './db/sources';
import { recordPrice, snapshotDatesForProduct } from './db/snapshots';
import { startBackfillRun } from './db/runs';
import { jalaliDateToIso } from './jalali';
import { describeError, logInfo, logWarn } from './logger';
import { parsePriceToIrr } from './pricing';
import { pickVariant, summarizeVariants } from './digikalaVariants';
import { fetchDigikalaJson, fetchDigikalaProduct } from './digikalaProduct';

/**
 * Digikala exposes a public (unofficial) price-chart endpoint that returns the
 * last ~30 days of daily prices, grouped by the variant dimension the product
 * uses (colour or size):
 *
 *   GET https://api.digikala.com/v1/product/{id}/price-chart/
 *   Referer: https://www.digikala.com/   (required, otherwise HTTP 429)
 *
 * We call it exactly once, when a product is first added to the database, so a
 * newly tracked product starts with 30 days of history instead of an empty
 * chart. Products that already exist keep the history we collected ourselves.
 *
 * Important: each chart group follows one *seller's* line for that colour, not
 * the cheapest seller we track. The level can therefore differ from our live
 * price by several percent. We only import the history when the two agree
 * closely enough (`DEFAULT_MAX_CHART_MISMATCH`, overridable per source via
 * `settings.chart_max_mismatch`); otherwise the chart starts today
 * instead of showing a fabricated cliff.
 */

/** How far the chart's newest price may drift from our live price before we refuse to import it. */
const DEFAULT_MAX_CHART_MISMATCH = 0.05;

const DEFAULT_SOURCE: SourceConfig = {
  adapter: 'digikala_api',
  timeout_seconds: 12,
  rate_limit_seconds: 5,
  currency: 'IRR',
  price_multiplier: 1,
  headers: {},
  settings: {},
};

export interface PriceChartPoint {
  /** Jalali day as returned by Digikala, e.g. `1405/07/23`. */
  day: string;
  /** UTC ISO timestamp placed on that calendar day. */
  observedAt: string;
  priceIrr: number | null;
  rrpPriceIrr: number | null;
  seller: string | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  isMarketable: boolean | null;
  warranty: string | null;
}

export interface PriceChartGroup {
  id: string | number | null;
  title: string | null;
  points: PriceChartPoint[];
}

export interface ParsedPriceChart {
  /** Gregorian date of the chart's newest day, as reported by the API. */
  today: string | null;
  /** What the groups represent, e.g. `انتخاب رنگ` (colour) or `انتخاب سایز` (size). */
  selectionTitle: string | null;
  groups: PriceChartGroup[];
}

export interface ChartSeries {
  /** `color` = one colour's line; `floor` = per-day cheapest across all colours. */
  kind: 'color' | 'floor';
  points: PriceChartPoint[];
  label: string | null;
  groupIds: Array<string | number | null>;
}

export interface BackfillResult {
  inserted: number;
  skipped: number;
  groups: number;
  reason?:
    | 'unsupported_source'
    | 'no_product_id'
    | 'no_history'
    | 'fetch_failed'
    | 'no_new_days'
    | 'color_not_in_chart'
    | 'chart_mismatch';
}

export function priceChartApiUrl(productId: string): string {
  return `https://api.digikala.com/v1/product/${productId}/price-chart/`;
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toPoint(row: Record<string, any>, source: SourceConfig): PriceChartPoint | null {
  const day = row?.day === undefined || row?.day === null ? null : String(row.day).trim();
  const observedAt = jalaliDateToIso(day);
  if (!day || !observedAt) return null;

  const priceIrr =
    parsePriceToIrr(row.selling_price, source.price_multiplier) ??
    parsePriceToIrr(row.rrp_price, source.price_multiplier);
  const rrpPriceIrr = parsePriceToIrr(row.rrp_price, source.price_multiplier);

  const isMarketable =
    typeof row.is_marketable === 'boolean' ? row.is_marketable : null;
  const availability =
    isMarketable === null ? 'unknown' : isMarketable ? 'in_stock' : 'out_of_stock';

  const seller =
    typeof row.seller === 'string' && row.seller.trim() ? row.seller.trim() : null;
  const warranty =
    typeof row.product_warranty === 'string' && row.product_warranty.trim()
      ? row.product_warranty.trim()
      : null;

  return { day, observedAt, priceIrr, rrpPriceIrr, seller, availability, isMarketable, warranty };
}

export function parsePriceChartPayload(
  payload: any,
  source: SourceConfig = DEFAULT_SOURCE
): ParsedPriceChart {
  const data = payload?.data ?? {};
  const rawGroups = Array.isArray(data.price_chart) ? data.price_chart : [];

  const groups: PriceChartGroup[] = [];
  for (const raw of rawGroups) {
    const history = Array.isArray(raw?.history) ? raw.history : [];
    const points = history
      .map((row: any) => toPoint(row, source))
      .filter((p: PriceChartPoint | null): p is PriceChartPoint => p !== null);

    if (points.length === 0) continue;
    groups.push({
      id: raw?.id ?? null,
      title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
      points,
    });
  }

  return {
    today: typeof data.today === 'string' ? data.today : null,
    selectionTitle:
      typeof data.chart_selection_title === 'string' ? data.chart_selection_title : null,
    groups,
  };
}

/**
 * Turns the per-colour chart groups into the single series we actually track:
 * the chosen colour's line, or the per-day cheapest across every colour.
 */
export function selectChartSeries(
  groups: PriceChartGroup[],
  options: { colorId?: string | null; colorLabel?: string | null } = {}
): ChartSeries | null {
  if (groups.length === 0) return null;

  const colorId = options.colorId === undefined || options.colorId === null
    ? ''
    : String(options.colorId).trim();

  if (colorId) {
    // Match by label first: Digikala's chart group `id` is a positional index
    // (0,1,2…), *not* the colour id, so matching by id would happily return a
    // different colour. Ids are only trusted for untitled groups.
    const wanted = normalizeLabel(options.colorLabel);
    if (wanted) {
      const byLabel = groups.find((g) => normalizeLabel(g.title) === wanted);
      if (byLabel) {
        return { kind: 'color', points: byLabel.points, label: byLabel.title, groupIds: [byLabel.id] };
      }
    }
    const byId = groups.find(
      (g) => g.id !== null && String(g.id) === colorId && !normalizeLabel(g.title)
    );
    if (byId) {
      return { kind: 'color', points: byId.points, label: byId.title, groupIds: [byId.id] };
    }
    return null;
  }

  const cheapestPerDay = new Map<string, PriceChartPoint>();
  for (const group of groups) {
    for (const point of group.points) {
      if (point.priceIrr === null) continue;
      if (point.isMarketable === false) continue;
      const current = cheapestPerDay.get(point.day);
      if (!current || (point.priceIrr as number) < (current.priceIrr as number)) {
        cheapestPerDay.set(point.day, point);
      }
    }
  }

  const points = Array.from(cheapestPerDay.values()).sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt)
  );
  if (points.length === 0) return null;

  return { kind: 'floor', points, label: null, groupIds: groups.map((g) => g.id) };
}

function newestPricedPoint(points: PriceChartPoint[]): PriceChartPoint | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].priceIrr !== null) return points[i];
  }
  return null;
}

function isDigikalaSource(source: SourceConfig | undefined): boolean {
  return Boolean(source && source.adapter.startsWith('digikala'));
}

/**
 * One-time backfill of the last ~30 days of Digikala prices for a product that
 * was just created. Never throws: a failed backfill must not fail product
 * creation, it only means the chart starts empty and fills up over time.
 */
export async function backfillDigikalaPriceHistory(
  db: Database.Database,
  options: {
    productKey: string;
    url: string;
    sourceKey: string;
    colorId?: string | null;
    colorLabel?: string | null;
    now?: Date;
  }
): Promise<BackfillResult> {
  const { productKey, url, sourceKey } = options;
  const now = options.now ?? new Date();

  try {
    const source = getSourcesMap(db)[sourceKey] ?? DEFAULT_SOURCE;
    if (!isDigikalaSource(source)) {
      return { inserted: 0, skipped: 0, groups: 0, reason: 'unsupported_source' };
    }

    const productId = extractProductId(url);
    if (!productId) {
      return { inserted: 0, skipped: 0, groups: 0, reason: 'no_product_id' };
    }

    // Keep product creation snappy: the chart request gets at most 10s and the
    // optional product detail at most 6s.
    const timeoutMs = Math.max(5, Math.min(source.timeout_seconds || 12, 10)) * 1000;
    const detailTimeoutMs = Math.min(timeoutMs, 6000);
    const apiUrl = priceChartApiUrl(productId);

    const payload = await fetchDigikalaJson(apiUrl, source, timeoutMs);
    if (!payload) {
      logWarn('digikala_history', 'price-chart request failed', {
        product_key: productKey,
        product_id: productId,
        url: apiUrl,
      });
      return { inserted: 0, skipped: 0, groups: 0, reason: 'fetch_failed' };
    }

    const parsed = parsePriceChartPayload(payload, source);
    if (parsed.groups.length === 0) {
      return { inserted: 0, skipped: 0, groups: 0, reason: 'no_history' };
    }

    // Resolve the live price with the same rule the runner uses, so the imported
    // history and the first live snapshot describe the same thing.
    const product = await fetchDigikalaProduct(productId, source, detailTimeoutMs);
    const colorId = options.colorId ?? null;
    let livePriceIrr: number | null = null;
    let colorLabel = options.colorLabel ?? null;

    if (product) {
      if (colorId) {
        const picked = pickVariant(product, { colorId, multiplier: source.price_multiplier });
        livePriceIrr = picked.priceIrr;
        colorLabel = colorLabel ?? picked.variant?.colorLabel ?? null;
      } else {
        const summary = summarizeVariants(product, source.price_multiplier);
        livePriceIrr = summary.floor.priceIrr;
      }
    }

    const series = selectChartSeries(parsed.groups, { colorId, colorLabel });
    if (!series) {
      return {
        inserted: 0,
        skipped: 0,
        groups: parsed.groups.length,
        reason: colorId ? 'color_not_in_chart' : 'no_history',
      };
    }

    const anchor = newestPricedPoint(series.points);
    const mismatch =
      livePriceIrr && anchor && anchor.priceIrr
        ? Math.abs(anchor.priceIrr - livePriceIrr) / livePriceIrr
        : 0;

    const maxMismatch = Number.isFinite(Number(source.settings?.chart_max_mismatch))
      ? Number(source.settings?.chart_max_mismatch)
      : DEFAULT_MAX_CHART_MISMATCH;

    if (livePriceIrr && anchor && anchor.priceIrr && mismatch > maxMismatch) {
      logInfo('digikala_history', 'skipping chart history: level does not match live price', {
        product_key: productKey,
        product_id: productId,
        chart_price: anchor.priceIrr,
        live_price: livePriceIrr,
        mismatch_percent: Math.round(mismatch * 1000) / 10,
      });
      return {
        inserted: 0,
        skipped: 0,
        groups: parsed.groups.length,
        reason: 'chart_mismatch',
      };
    }

    // The newest chart day is "today": the live collector will record it, so
    // importing it here would put two points on the same calendar day.
    const newestDay = series.points[series.points.length - 1].observedAt.slice(0, 10);
    const withoutToday = series.points.filter((point) => point.observedAt.slice(0, 10) !== newestDay);

    const existingDays = snapshotDatesForProduct(db, productKey, sourceKey);
    const target: TargetConfig = {
      product_key: productKey,
      source_key: sourceKey,
      url,
      enabled: true,
      adapter_settings: {},
      color_id: colorId,
      color_label: colorLabel,
    };

    const rows = withoutToday
      .filter((point) => point.priceIrr !== null)
      .map((point) => {
        const observedAt =
          new Date(point.observedAt).getTime() > now.getTime()
            ? now.toISOString()
            : point.observedAt;
        return { point, observedAt };
      })
      .filter(({ observedAt }) => !existingDays.has(observedAt.slice(0, 10)));

    const skipped = series.points.length - rows.length;
    if (rows.length === 0) {
      return { inserted: 0, skipped, groups: parsed.groups.length, reason: 'no_new_days' };
    }

    const runId = startBackfillRun(db, {
      product_key: productKey,
      source_key: sourceKey,
      product_id: productId,
      api_url: apiUrl,
      chart_group_id: series.groupIds.length === 1 ? series.groupIds[0] : null,
      chart_group_title: series.label,
      points: rows.length,
    });

    const insert = db.transaction(() => {
      for (const { point, observedAt } of rows) {
        const observation: PriceObservation = {
          title: null,
          seller: point.seller,
          price_irr: point.priceIrr,
          availability: point.availability,
          raw_observation: {
            adapter: 'digikala_price_chart',
            parse_method: 'price_chart',
            api_url: apiUrl,
            product_id: productId,
            chart_kind: series.kind,
            chart_group_id: series.groupIds.length === 1 ? series.groupIds[0] : null,
            chart_group_title: series.label,
            chart_group_ids: series.kind === 'floor' ? series.groupIds : undefined,
            chart_selection_title: parsed.selectionTitle,
            color_id: colorId,
            color_label: colorLabel,
            day: point.day,
            rrp_price_irr: point.rrpPriceIrr,
            is_marketable: point.isMarketable,
            warranty: point.warranty,
            backfill: true,
          },
        };
        recordPrice(db, runId, target, observation, observedAt);
      }
    });
    insert();

    logInfo('digikala_history', 'backfilled price history', {
      product_key: productKey,
      product_id: productId,
      kind: series.kind,
      group: series.label ?? 'floor',
      color_id: colorId,
      inserted: rows.length,
      skipped,
      mismatch_percent: Math.round(mismatch * 1000) / 10,
    });

    return { inserted: rows.length, skipped, groups: parsed.groups.length };
  } catch (error) {
    logWarn('digikala_history', 'price history backfill failed', {
      product_key: productKey,
      ...describeError(error),
    });
    return { inserted: 0, skipped: 0, groups: 0, reason: 'fetch_failed' };
  }
}
