import { extractProductId, extractVariantId } from './adapters/digikalaApi';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'ref_src',
  'tag',
  'src',
  'source',
]);

/**
 * Normalizes a product target URL for canonical deduplication.
 * - Trims whitespace
 * - Handles Digikala canonical product ID & variant
 * - Strips common marketing/tracking query parameters
 * - Lowercases protocol and host
 * - Normalizes trailing slashes
 */
export function normalizeTargetUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);

    // Normalize protocol and host
    const protocol = url.protocol.toLowerCase();
    const host = url.host.toLowerCase();

    // Check if it's a Digikala URL
    const isDigikala = host === 'digikala.com' || host === 'www.digikala.com' || host.endsWith('.digikala.com');
    if (isDigikala) {
      const productId = extractProductId(trimmed);
      if (productId) {
        const variantId = extractVariantId(trimmed);
        const fresh = url.pathname.includes('/fresh/');
        const basePath = fresh ? `/fresh/v1/product/${productId}/` : `/product/dkp-${productId}/`;
        const params = new URLSearchParams();
        if (variantId) {
          params.set('variant_id', variantId);
        }
        const qs = params.toString();
        return `${protocol}//www.digikala.com${basePath}${qs ? `?${qs}` : ''}`;
      }
    }

    // Generic URL normalization
    // Remove hash
    url.hash = '';

    // Remove tracking query parameters
    const searchParams = new URLSearchParams(url.search);
    for (const key of Array.from(searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        searchParams.delete(key);
      }
    }

    // Sort remaining search parameters for deterministic URL matching
    searchParams.sort();

    // Remove trailing slash if path is longer than '/'
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    const qs = searchParams.toString();
    return `${protocol}//${host}${pathname}${qs ? `?${qs}` : ''}`;
  } catch {
    // If not a valid parseable URL, return trimmed lowercase version
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}
