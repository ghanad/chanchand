/**
 * Market-source products (USD, gold, coins) are polled on every scheduler run,
 * independently of the per-product active hour window. Keep this list aligned
 * with the migration in src/lib/db/migrations.ts and the UI hints.
 */
export const ALWAYS_ON_MARKET_PRODUCT_KEYS = [
  'usd',
  'gold',
  'coin',
  'sekkeh',
  'tala',
  'gold-18k',
  'gold-24k',
  'coin-quarter',
  'coin-half',
  'coin-emami',
] as const;

const ALWAYS_ON_MARKET_KEY_SET = new Set<string>(ALWAYS_ON_MARKET_PRODUCT_KEYS);

/** True when the source key/adapter belongs to a market data provider. */
export function isMarketSource(sourceKey?: string | null, adapter?: string | null): boolean {
  if (adapter === 'brsapi_market' || adapter === 'servix_market') return true;
  if (!sourceKey) return false;
  const lower = sourceKey.toLowerCase();
  return lower.includes('market') || lower.includes('servix') || lower.includes('brsapi');
}

interface AlwaysOnProductShape {
  key?: string | null;
  sources?: ReadonlyArray<string | null | undefined> | null;
  primary_target?: { source_key?: string | null } | null;
}

/**
 * True when a product is collected on every run (24 hours a day) and therefore
 * ignores the configurable active-hour window.
 */
export function isAlwaysOnMarketProduct(product?: AlwaysOnProductShape | null): boolean {
  if (!product) return false;
  if (product.key && ALWAYS_ON_MARKET_KEY_SET.has(product.key)) return true;

  const sources = (product.sources ?? []).filter(
    (source): source is string => typeof source === 'string' && source.length > 0
  );
  if (sources.length > 0) {
    return sources.some((source) => isMarketSource(source));
  }

  return isMarketSource(product.primary_target?.source_key);
}
