import { parsePriceToIrr } from './pricing';

/**
 * Digikala models one product page (`dkp-<id>`) with many *variants*. A variant
 * is a (colour × seller) offer: the same phone in "زرد لیمویی" can be sold by
 * ten different sellers, each with its own price and stock status.
 *
 * Our price rule is:
 *   - no colour selected  -> the cheapest marketable variant of the whole product
 *   - colour selected     -> the cheapest marketable variant of that colour
 *
 * The seller is never part of the tracked identity: within a colour we always
 * follow the cheapest offer. The colour *is* part of the identity (see
 * `managed_targets.color_id`), because two colours are two different SKUs with
 * two different price series.
 */

export type VariantAvailability = 'in_stock' | 'out_of_stock' | 'unknown';

export interface DigikalaVariant {
  id: string | null;
  colorId: string | null;
  colorLabel: string | null;
  colorHex: string | null;
  seller: string | null;
  priceIrr: number | null;
  marketable: boolean;
  status: string | null;
}

export interface DigikalaColorSummary {
  id: string;
  label: string | null;
  hex: string | null;
  /** Cheapest marketable price of this colour, or null when nothing is in stock. */
  priceIrr: number | null;
  sellerCount: number;
  inStock: boolean;
}

export interface DigikalaFloorSummary {
  priceIrr: number | null;
  colorId: string | null;
  colorLabel: string | null;
  seller: string | null;
  inStock: boolean;
}

export interface DigikalaVariantSummary {
  variants: DigikalaVariant[];
  colors: DigikalaColorSummary[];
  floor: DigikalaFloorSummary;
}

export interface PickedVariant {
  variant: DigikalaVariant | null;
  priceIrr: number | null;
  availability: VariantAvailability;
  /** False when a colour was requested but the product no longer offers it. */
  colorExists: boolean;
  candidateCount: number;
}

const MARKETABLE_STATUSES = new Set(['marketable', 'available', 'active']);
const UNAVAILABLE_STATUSES = new Set(['not_marketable', 'out_of_stock', 'unavailable', 'inactive']);

function toId(value: any): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function readColor(variant: Record<string, any>): { id: string | null; label: string | null; hex: string | null } {
  const color = variant?.color;
  if (color && typeof color === 'object') {
    return {
      id: toId(color.id ?? color.color_id),
      label: color.title ?? color.title_fa ?? color.name ?? null,
      hex: typeof color.hex_code === 'string' ? color.hex_code : null,
    };
  }
  return { id: null, label: null, hex: null };
}

function readSeller(variant: Record<string, any>): string | null {
  const seller = variant?.seller;
  if (typeof seller === 'string') return seller.trim() || null;
  if (seller && typeof seller === 'object') {
    for (const key of ['title', 'name', 'title_fa']) {
      if (typeof seller[key] === 'string' && seller[key].trim()) return seller[key].trim();
    }
  }
  return null;
}

export function variantPriceIrr(variant: Record<string, any> | null, multiplier: number): number | null {
  if (!variant) return null;
  const price = variant.price;
  if (price && typeof price === 'object') {
    for (const key of ['selling_price', 'final_price', 'rrp_price']) {
      const parsed = parsePriceToIrr(price[key], multiplier);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  return parsePriceToIrr(price, multiplier);
}

export function isMarketableVariant(variant: Record<string, any>): boolean {
  const status = typeof variant?.status === 'string' ? variant.status.toLowerCase().trim() : '';
  if (MARKETABLE_STATUSES.has(status)) return true;
  if (UNAVAILABLE_STATUSES.has(status)) return false;
  // No usable status: fall back to "has a price" so we never silently drop a
  // sellable offer just because Digikala omitted the field.
  return variantPriceIrr(variant, 1) !== null;
}

/**
 * Every variant of the product, de-duplicated by id. `default_variant` is
 * included because Digikala sometimes omits it from `variants`.
 */
export function collectVariants(product: Record<string, any>, multiplier: number): DigikalaVariant[] {
  const byId = new Map<string, DigikalaVariant>();
  const push = (raw: any) => {
    if (!raw || typeof raw !== 'object') return;
    const id = toId(raw.id);
    if (id && byId.has(id)) return;
    const color = readColor(raw);
    const status = typeof raw.status === 'string' ? raw.status : null;
    const normalized: DigikalaVariant = {
      id,
      colorId: color.id,
      colorLabel: color.label,
      colorHex: color.hex,
      seller: readSeller(raw),
      priceIrr: variantPriceIrr(raw, multiplier),
      marketable: isMarketableVariant(raw),
      status,
    };
    byId.set(id ?? `__anon_${byId.size}`, normalized);
  };

  if (Array.isArray(product?.variants)) {
    for (const raw of product.variants) push(raw);
  }
  push(product?.default_variant);

  return Array.from(byId.values());
}

export function summarizeVariants(product: Record<string, any>, multiplier: number): DigikalaVariantSummary {
  const variants = collectVariants(product, multiplier);
  const groups = new Map<string, DigikalaVariant[]>();

  for (const variant of variants) {
    const key = variant.colorId ?? '__none__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(variant);
    else groups.set(key, [variant]);
  }

  const colors: DigikalaColorSummary[] = [];
  for (const [key, bucket] of groups) {
    const inStockOffers = bucket.filter((v) => v.marketable && v.priceIrr !== null);
    const cheapest = inStockOffers.reduce<DigikalaVariant | null>(
      (best, v) => (best === null || (v.priceIrr as number) < (best.priceIrr as number) ? v : best),
      null
    );
    colors.push({
      id: key,
      label: bucket.find((v) => v.colorLabel)?.colorLabel ?? null,
      hex: bucket.find((v) => v.colorHex)?.colorHex ?? null,
      priceIrr: cheapest?.priceIrr ?? null,
      sellerCount: new Set(inStockOffers.map((v) => v.seller).filter(Boolean)).size,
      inStock: cheapest !== null,
    });
  }

  const cheapestOverall = variants
    .filter((v) => v.marketable && v.priceIrr !== null)
    .reduce<DigikalaVariant | null>(
      (best, v) => (best === null || (v.priceIrr as number) < (best.priceIrr as number) ? v : best),
      null
    );

  return {
    variants,
    colors,
    floor: {
      priceIrr: cheapestOverall?.priceIrr ?? null,
      colorId: cheapestOverall?.colorId ?? null,
      colorLabel: cheapestOverall?.colorLabel ?? null,
      seller: cheapestOverall?.seller ?? null,
      inStock: cheapestOverall !== null,
    },
  };
}

/**
 * Applies the price rule. `colorId` null/undefined means "cheapest anywhere".
 */
export function pickVariant(
  product: Record<string, any>,
  options: { colorId?: string | null; multiplier: number }
): PickedVariant {
  const variants = collectVariants(product, options.multiplier);
  if (variants.length === 0) {
    return { variant: null, priceIrr: null, availability: 'unknown', colorExists: false, candidateCount: 0 };
  }

  const wantedColor = toId(options.colorId);
  let scope = variants;
  let colorExists = true;

  if (wantedColor) {
    const ofColor = variants.filter((v) => v.colorId === wantedColor);
    colorExists = ofColor.length > 0;
    scope = ofColor;
  }

  const candidates = scope.filter((v) => v.marketable && v.priceIrr !== null);
  if (candidates.length === 0) {
    return {
      variant: null,
      priceIrr: null,
      availability: 'out_of_stock',
      colorExists,
      candidateCount: 0,
    };
  }

  const cheapest = candidates.reduce((best, v) =>
    (v.priceIrr as number) < (best.priceIrr as number) ? v : best
  );

  return {
    variant: cheapest,
    priceIrr: cheapest.priceIrr,
    availability: 'in_stock',
    colorExists,
    candidateCount: candidates.length,
  };
}
