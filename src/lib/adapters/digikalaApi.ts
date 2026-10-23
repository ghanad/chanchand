import { FetchContext, PriceAdapter } from './types';
import { PriceObservation, SourceConfig } from '../types';
import { detectAvailability, parsePriceToIrr } from '../pricing';

export function extractProductId(url: string): string | null {
  const match = url.match(/(?:dkp-|(?:\/product\/))(\d+)/i);
  return match ? match[1] : null;
}

export function extractVariantId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const variantId = parsed.searchParams.get('variant_id');
    if (variantId && /^\d+$/.test(variantId.trim())) {
      return variantId.trim();
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
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
    const variantId = extractVariantId(context.target.url);
    return this.fetchApi(context, productId, variantId, isFreshUrl(context.target.url));
  }

  async fetchApi(
    context: FetchContext,
    productId: string,
    variantId?: string | null,
    fresh = false
  ): Promise<PriceObservation> {
    let apiUrl = productApiUrl(productId, fresh);
    const headers: Record<string, string> = {
      'User-Agent': 'price-getter/0.1',
      Accept: 'application/json',
      ...context.source.headers,
    };

    let response = await fetch(apiUrl, {
      headers,
      signal: AbortSignal.timeout(context.source.timeout_seconds * 1000),
    });

    if (!response.ok) {
      throw new Error(`Digikala API request failed: ${response.status} ${response.statusText}`);
    }

    let payload: any = await response.json();
    let product = payload?.data?.product;

    if (!product && !fresh && payload?.redirect_url?.uri?.includes('/fresh/product/')) {
      apiUrl = productApiUrl(productId, true);
      response = await fetch(apiUrl, {
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
      variantId,
      apiUrl,
      statusCode: response.status,
    });
  }

  parseApiProduct(
    product: Record<string, any>,
    source: SourceConfig,
    options: {
      variantId?: string | null;
      apiUrl?: string;
      statusCode?: number;
    } = {}
  ): PriceObservation {
    const variant = this.bestVariant(product, options.variantId);
    if (options.variantId && !variant) {
      throw new Error(`Digikala API response did not include requested variant ${options.variantId}`);
    }

    const priceIrr = this.variantPriceIrr(variant, source);
    const seller = this.sellerName(variant?.seller);
    const availability = this.apiAvailability(product, variant);

    if (priceIrr === null && availability === 'unknown') {
      throw new Error('could not extract Digikala API price data');
    }

    const title = product.title_fa || product.title_en || product.test_title_fa || null;

    return {
      title,
      seller,
      price_irr: priceIrr,
      availability,
      raw_observation: {
        adapter: this.name,
        status_code: options.statusCode,
        parse_method: 'digikala_api',
        api_url: options.apiUrl,
        product_id: product.id,
        requested_variant_id: options.variantId,
        variant_id: variant?.id,
        extracted: {
          title,
          seller,
          availability,
        },
      },
    };
  }

  private bestVariant(product: Record<string, any>, variantId?: string | null): Record<string, any> | null {
    const defaultVariant = product.default_variant;
    if (variantId) {
      if (defaultVariant && String(defaultVariant.id) === variantId) {
        return defaultVariant;
      }
      if (Array.isArray(product.variants)) {
        for (const v of product.variants) {
          if (v && String(v.id) === variantId) {
            return v;
          }
        }
      }
      return null;
    }

    if (defaultVariant && typeof defaultVariant === 'object') {
      return defaultVariant;
    }

    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v && String(v.status || '').toLowerCase() === 'marketable') {
          return v;
        }
      }
      for (const v of product.variants) {
        if (v && typeof v === 'object') {
          return v;
        }
      }
    }
    return null;
  }

  private variantPriceIrr(variant: Record<string, any> | null, source: SourceConfig): number | null {
    if (!variant) return null;
    const price = variant.price;
    if (price && typeof price === 'object') {
      for (const key of ['selling_price', 'final_price', 'rrp_price']) {
        const parsed = parsePriceToIrr(price[key], source.price_multiplier);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
    return parsePriceToIrr(variant.price, source.price_multiplier);
  }

  private apiAvailability(
    product: Record<string, any>,
    variant: Record<string, any> | null
  ): 'in_stock' | 'out_of_stock' | 'unknown' {
    const candidates = [
      variant?.status,
      product.status,
      product.data_layer?.dimension20,
    ];

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

  private sellerName(value: any): string | null {
    if (typeof value === 'string') {
      return value.trim() || null;
    }
    if (value && typeof value === 'object') {
      for (const key of ['title', 'name', 'title_fa']) {
        if (typeof value[key] === 'string' && value[key].trim()) {
          return value[key].trim();
        }
      }
    }
    return null;
  }
}
