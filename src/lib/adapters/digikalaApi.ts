import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig } from '../types';
import { detectAvailability } from '../pricing';
import { createHttpErrorFromResponse, fetchWithCookieRedirect } from './fetchUtils';
import { pickVariant } from '../digikalaVariants';

export function extractProductId(url: string): string | null {
  const match = url.match(/(?:dkp-|(?:\/product\/))(\d+)/i);
  return match ? match[1] : null;
}

export function isFreshUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/fresh/');
  } catch {
    return false;
  }
}

export function productApiUrl(productId: string, fresh = false): string {
  if (fresh) {
    return `https://api.digikala.com/fresh/v1/product/${productId}/`;
  }
  return `https://api.digikala.com/v2/product/${productId}/`;
}

export class DigikalaApiAdapter implements PriceAdapter {
  name = 'digikala_api';

  async fetch(context: FetchContext): Promise<PriceObservation> {
    const productId = extractProductId(context.target.url);
    if (!productId) {
      throw new Error('could not extract Digikala product ID from target URL');
    }
    return this.fetchApi(context, productId, context.target.color_id ?? null, isFreshUrl(context.target.url));
  }

  async fetchApi(
    context: FetchContext,
    productId: string,
    colorId?: string | null,
    fresh = false
  ): Promise<PriceObservation> {
    let apiUrl = productApiUrl(productId, fresh);
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      ...context.source.headers,
    };

    let response = await fetchWithCookieRedirect(apiUrl, {
      headers,
      signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
    });

    if (!response.ok) {
      throw await createHttpErrorFromResponse('Digikala API', apiUrl, response);
    }

    let payload: any = await response.json();
    let product = payload?.data?.product;

    if (!product && !fresh && payload?.redirect_url?.uri?.includes('/fresh/product/')) {
      apiUrl = productApiUrl(productId, true);
      response = await fetchWithCookieRedirect(apiUrl, {
        headers,
        signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
      });
      if (response.ok) {
        payload = await response.json();
        product = payload?.data?.product;
      }
    }

    if (!product) {
      throw new Error('Digikala API response did not include product data');
    }

    return this.parseApiProduct(product, context.source, {
      colorId,
      apiUrl,
      statusCode: response.status,
    });
  }

  parseApiProduct(
    product: Record<string, any>,
    source: SourceConfig,
    options: {
      colorId?: string | null;
      apiUrl?: string;
      statusCode?: number;
    } = {}
  ): PriceObservation {
    const picked = pickVariant(product, {
      colorId: options.colorId,
      multiplier: source.price_multiplier,
    });

    const availability = this.apiAvailability(product, picked.availability);
    if (picked.priceIrr === null && availability === 'unknown') {
      throw new Error('could not extract Digikala API price data');
    }

    const title = product.title_fa || product.title_en || product.test_title_fa || null;
    const seller = picked.variant?.seller ?? null;

    return {
      title,
      seller,
      price_irr: picked.priceIrr,
      availability,
      raw_observation: {
        adapter: this.name,
        status_code: options.statusCode,
        parse_method: 'digikala_api',
        api_url: options.apiUrl,
        product_id: product.id,
        requested_color_id: options.colorId ?? null,
        color_id: picked.variant?.colorId ?? null,
        color_label: picked.variant?.colorLabel ?? null,
        color_missing: options.colorId ? !picked.colorExists : undefined,
        variant_id: picked.variant?.id ?? null,
        variant_status: picked.variant?.status ?? null,
        candidate_count: picked.candidateCount,
        price_rule: options.colorId ? 'cheapest_of_color' : 'cheapest_of_product',
        extracted: {
          title,
          seller,
          availability,
        },
      },
    };
  }

  private apiAvailability(
    product: Record<string, any>,
    picked: 'in_stock' | 'out_of_stock' | 'unknown'
  ): 'in_stock' | 'out_of_stock' | 'unknown' {
    if (picked !== 'unknown') return picked;

    const candidates = [product.status, product.data_layer?.dimension20];

    for (const val of candidates) {
      if (typeof val !== 'string') continue;
      const lower = val.toLowerCase();
      if (['marketable', 'available', 'active'].includes(lower)) {
        return 'in_stock';
      }
      if (['not_marketable', 'out_of_stock', 'unavailable', 'inactive'].includes(lower)) {
        return 'out_of_stock';
      }
      const detected = detectAvailability(val);
      if (detected !== 'unknown') {
        return detected;
      }
    }
    return 'unknown';
  }
}
