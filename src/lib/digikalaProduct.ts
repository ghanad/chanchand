import { SourceConfig } from './types';
import { fetchWithCookieRedirect } from './adapters/fetchUtils';
import { summarizeVariants, pickVariant, DigikalaColorSummary } from './digikalaVariants';

/**
 * Small helpers around Digikala's product-detail endpoint. Used by the
 * "preview before adding" flow and by the one-time history backfill, so both
 * apply exactly the same price rule.
 */

export const DIGIKALA_REFERER = 'https://www.digikala.com/';
export const DIGIKALA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function productDetailApiUrls(productId: string): string[] {
  return [
    `https://api.digikala.com/product/v1/products/${productId}/`,
    `https://api.digikala.com/v2/product/${productId}/`,
  ];
}

export async function fetchDigikalaJson(
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

/** Tries the detail endpoints newest-first; returns null when none answers. */
export async function fetchDigikalaProduct(
  productId: string,
  source: SourceConfig,
  timeoutMs: number
): Promise<Record<string, any> | null> {
  for (const url of productDetailApiUrls(productId)) {
    try {
      const payload = await fetchDigikalaJson(url, source, timeoutMs);
      const product = payload?.data?.product;
      if (product && typeof product === 'object') return product;
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}

export interface DigikalaPreview {
  product_id: string;
  title: string | null;
  brand: string | null;
  image_url: string | null;
  /** Cheapest marketable offer of the whole product (the default choice). */
  floor_price_irr: number | null;
  floor_color_label: string | null;
  in_stock: boolean;
  colors: DigikalaColorSummary[];
}

function pickString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function buildDigikalaPreview(
  product: Record<string, any>,
  source: SourceConfig,
  productId: string
): DigikalaPreview {
  const summary = summarizeVariants(product, source.price_multiplier);
  const images = product?.images;
  const mainImage =
    images?.main?.url?.[0] ??
    images?.main?.url_webp?.[0] ??
    (Array.isArray(images) ? images[0]?.url?.[0] : null) ??
    null;

  return {
    product_id: productId,
    title: pickString(product.title_fa, product.title_en, product.test_title_fa),
    brand: pickString(product.brand?.title_fa, product.brand?.title, product.brand?.name),
    image_url: pickString(mainImage),
    floor_price_irr: summary.floor.priceIrr,
    floor_color_label: summary.floor.colorLabel,
    in_stock: summary.floor.inStock,
    // `__none__` is the bucket for variants without a colour; it is not a
    // selectable colour, so the picker only offers real ones.
    colors: summary.colors.filter((color) => color.id !== '__none__'),
  };
}

/** Convenience for callers that only need the price of one colour. */
export function previewColorPrice(
  product: Record<string, any>,
  source: SourceConfig,
  colorId: string | null
): number | null {
  if (!colorId) return summarizeVariants(product, source.price_multiplier).floor.priceIrr;
  return pickVariant(product, { colorId, multiplier: source.price_multiplier }).priceIrr;
}
