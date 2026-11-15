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
 */

const DIGIKALA_REFERER = 'https://www.digikala.com/';
const DIGIKALA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

export interface PriceChartHint {
  colorTitle?: string | null;
  sizeTitle?: string | null;
  currentPriceIrr?: number | null;
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
    | 'no_new_days';
}

export function priceChartApiUrl(productId: string): string {
  return `https://api.digikala.com/v1/product/${productId}/price-chart/`;
}

/** Product detail endpoints, newest first, used only to pick the right chart group. */
export function productDetailApiUrls(productId: string): string[] {
  return [
    `https://api.digikala.com/product/v1/products/${productId}/`,
    `https://api.digikala.com/v2/product/${productId}/`,
  ];
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
 * Picks the chart group that matches the product's default variant. When the
 * product only has one group we take it as-is; otherwise we match the group
 * title against the variant colour/size and fall back to the price closest to
 * the current selling price.
 */
export function pickPriceChartGroup(
  groups: PriceChartGroup[],
  hint?: PriceChartHint | null
): PriceChartGroup | null {
  if (groups.length === 0) return null;
  if (groups.length === 1) return groups[0];

  const wanted = [hint?.colorTitle, hint?.sizeTitle]
    .map(normalizeLabel)
    .filter((label) => label.length > 0);

  for (const label of wanted) {
    const match = groups.find((g) => normalizeLabel(g.title) === label);
    if (match) return match;
  }

  const currentPrice = hint?.currentPriceIrr ?? null;
  if (currentPrice && currentPrice > 0) {
    let best: PriceChartGroup | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const group of groups) {
      const last = [...group.points].reverse().find((p) => p.priceIrr !== null);
      if (!last || last.priceIrr === null) continue;
      const diff = Math.abs(last.priceIrr - currentPrice);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = group;
      }
    }
    if (best) return best;
  }

  return groups[0];
}

async function fetchJson(
  url: string,
  source: SourceConfig,
  timeoutMs: number
): Promise<any | null> {
  const headers: Record<string, string> = {
    'User-Agent': DIGIKALA_USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    Referer: DIGIKALA_REFERER,
    ...source.headers,
  };

  const response = await fetchWithCookieRedirect(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchVariantHint(
  productId: string,
  source: SourceConfig,
  timeoutMs: number
): Promise<PriceChartHint | null> {
  for (const url of productDetailApiUrls(productId)) {
    try {
      const payload = await fetchJson(url, source, timeoutMs);
      const variant = payload?.data?.product?.default_variant;
      if (!variant) continue;

      const colorTitle =
        variant?.color?.title ?? variant?.color?.title_fa ?? variant?.color?.name ?? null;
      const sizeTitle = variant?.size?.title ?? variant?.size?.title_fa ?? null;
      const currentPriceIrr = parsePriceToIrr(
        variant?.price?.selling_price ?? variant?.price?.final_price,
        source.price_multiplier
      );

      return { colorTitle, sizeTitle, currentPriceIrr };
    } catch {
      // Try the next endpoint; the hint is optional.
    }
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
    // optional variant hint at most 6s.
    const timeoutMs = Math.max(5, Math.min(source.timeout_seconds || 12, 10)) * 1000;
    const hintTimeoutMs = Math.min(timeoutMs, 6000);
    const apiUrl = priceChartApiUrl(productId);

    const payload = await fetchJson(apiUrl, source, timeoutMs);
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

    const hint =
      parsed.groups.length > 1 ? await fetchVariantHint(productId, source, hintTimeoutMs) : null;
    const group = pickPriceChartGroup(parsed.groups, hint);
    if (!group) {
      return { inserted: 0, skipped: 0, groups: parsed.groups.length, reason: 'no_history' };
    }

    const existingDays = snapshotDatesForProduct(db, productKey, sourceKey);
    const target: TargetConfig = {
      product_key: productKey,
      source_key: sourceKey,
      url,
      enabled: true,
      adapter_settings: {},
    };

    const rows = group.points
      .filter((point) => point.priceIrr !== null)
      .map((point) => {
        const observedAt =
          new Date(point.observedAt).getTime() > now.getTime()
            ? now.toISOString()
            : point.observedAt;
        return { point, observedAt };
      })
      .filter(({ observedAt }) => !existingDays.has(observedAt.slice(0, 10)));

    const skipped = group.points.length - rows.length;
    if (rows.length === 0) {
      return { inserted: 0, skipped, groups: parsed.groups.length, reason: 'no_new_days' };
    }

    const runId = startBackfillRun(db, {
      product_key: productKey,
      source_key: sourceKey,
      product_id: productId,
      api_url: apiUrl,
      chart_group_id: group.id,
      chart_group_title: group.title,
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
            chart_group_id: group.id,
            chart_group_title: group.title,
            chart_selection_title: parsed.selectionTitle,
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
      group: group.title ?? group.id,
      inserted: rows.length,
      skipped,
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
