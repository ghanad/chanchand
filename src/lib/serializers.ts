import { AppConfig, FetchErrorRow, PriceSnapshotRow, RunRow } from './types';

export const USD_PRODUCT_KEY = 'usd';
export const USD_HISTORY_LIMIT = 10000;

export function priceToman(priceIrr: number | null | undefined): number | null {
  if (priceIrr === null || priceIrr === undefined) return null;
  if (priceIrr % 10 === 0) return priceIrr / 10;
  return Math.round((priceIrr / 10) * 10) / 10;
}

export function priceUsd(priceIrr: number | null | undefined, usdRateIrr: number | null | undefined): number | null {
  if (priceIrr === null || priceIrr === undefined || !usdRateIrr || usdRateIrr <= 0) {
    return null;
  }
  return Math.round((priceIrr / usdRateIrr) * 100) / 100;
}

export function serializePrice(
  row: PriceSnapshotRow,
  usdRateIrr?: number | null
): Record<string, any> {
  const تومان = priceToman(row.price_irr);
  const دلار = priceUsd(row.price_irr, usdRateIrr);
  const usdRateToman = priceToman(usdRateIrr);

  return {
    id: row.id,
    run_id: row.run_id,
    product_key: row.product_key,
    source_key: row.source_key,
    url: row.url,
    title: row.title,
    seller: row.seller,
    price_irr: row.price_irr,
    price_toman: تومان,
    price_usd: دلار,
    usd_rate_irr: usdRateIrr ?? null,
    usd_rate_toman: usdRateToman,
    availability: row.availability,
    observed_at: row.observed_at,
  };
}

export function serializeError(row: FetchErrorRow): Record<string, any> {
  return {
    id: row.id,
    run_id: row.run_id,
    product_key: row.product_key,
    source_key: row.source_key,
    url: row.url,
    error_type: row.error_type,
    message: row.message,
    observed_at: row.observed_at,
  };
}

export function serializeRun(row: RunRow): Record<string, any> {
  return {
    id: row.id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    config_path: row.config_path,
    target_count: row.target_count,
    success_count: row.success_count,
    error_count: row.error_count,
  };
}

export function productsPayload(
  config?: AppConfig | null,
  dbProducts: Array<{
    id?: number;
    run_id?: number;
    key: string;
    title: string;
    user_id?: number | null;
    owner_username?: string | null;
    is_public?: number | boolean;
  }> = [],
  managedTargets?: Array<{
    product_key: string;
    source_key: string;
    url: string;
    enabled: number | boolean;
  }>,
  currentUser?: { id: number; role: string } | null
): Array<Record<string, any>> {
  const products: Record<string, any> = {};

  for (const dbProduct of dbProducts) {
    const isPublic = Boolean(dbProduct.is_public);
    const isOwner = currentUser?.id != null && dbProduct.user_id === currentUser.id;
    const isAdmin = currentUser?.role === 'admin';
    const canEdit = isAdmin || (isOwner && !isPublic);

    products[dbProduct.key] = {
      key: dbProduct.key,
      title: dbProduct.title,
      user_id: dbProduct.user_id ?? null,
      owner_username: dbProduct.owner_username ?? null,
      is_public: isPublic,
      can_edit: canEdit,
      configured: true,
      target_count: 0,
      enabled_target_count: 0,
      sources: [],
      primary_target: null,
    };
  }

  for (const [key, prod] of Object.entries(config?.products || {})) {
    if (!products[key]) {
      products[key] = {
        key,
        title: prod.title,
        user_id: null,
        owner_username: null,
        is_public: true,
        can_edit: currentUser?.role === 'admin',
        configured: true,
        target_count: 0,
        enabled_target_count: 0,
        sources: [],
        primary_target: null,
      };
    }
  }

  for (const target of managedTargets || []) {
    if (!products[target.product_key]) {
      products[target.product_key] = {
        key: target.product_key,
        title: target.product_key,
        configured: true,
        target_count: 0,
        enabled_target_count: 0,
        sources: [],
        primary_target: null,
      };
    }
    const product = products[target.product_key];
    product.target_count++;
    const isEnabled = Boolean(target.enabled);
    if (isEnabled) {
      product.enabled_target_count++;
    }
    if (!product.sources.includes(target.source_key)) {
      product.sources.push(target.source_key);
    }
    if (!product.primary_target) {
      product.primary_target = {
        source_key: target.source_key,
        url: target.url,
        enabled: isEnabled,
      };
    }
  }

  if (!managedTargets || managedTargets.length === 0) {
    for (const target of config?.targets || []) {
      if (!products[target.product_key]) {
        products[target.product_key] = {
          key: target.product_key,
          title: target.product_key,
          configured: false,
          target_count: 0,
          enabled_target_count: 0,
          sources: [],
          primary_target: null,
        };
      }
      const product = products[target.product_key];
      product.target_count++;
      if (target.enabled) {
        product.enabled_target_count++;
      }
      if (!product.sources.includes(target.source_key)) {
        product.sources.push(target.source_key);
      }
      if (!product.primary_target) {
        product.primary_target = {
          source_key: target.source_key,
          url: target.url,
          enabled: target.enabled,
        };
      }
    }
  }

  return Object.values(products).sort((a, b) => a.key.localeCompare(b.key));
}

export function sourcesPayload(
  config?: AppConfig | null,
  dbSources: Array<{ id?: number; run_id?: number; key: string; adapter: string }> = [],
  managedSources: Array<any> = []
): Array<Record<string, any>> {
  const sources: Record<string, any> = {};

  for (const s of managedSources) {
    sources[s.key] = {
      key: s.key,
      adapter: s.adapter,
      configured: true,
      ...(s.timeout_seconds !== undefined
        ? {
            timeout_seconds: s.timeout_seconds,
            rate_limit_seconds: s.rate_limit_seconds,
            currency: s.currency,
            price_multiplier: s.price_multiplier,
          }
        : {}),
    };
  }

  for (const [key, source] of Object.entries(config?.sources || {})) {
    if (!sources[key]) {
      sources[key] = {
        key,
        adapter: source.adapter,
        configured: true,
        timeout_seconds: source.timeout_seconds,
        rate_limit_seconds: source.rate_limit_seconds,
        currency: source.currency,
        price_multiplier: source.price_multiplier,
      };
    }
  }

  for (const dbSource of dbSources) {
    if (!sources[dbSource.key]) {
      sources[dbSource.key] = {
        key: dbSource.key,
        adapter: dbSource.adapter,
        configured: false,
      };
    }
  }

  return Object.values(sources).sort((a, b) => a.key.localeCompare(b.key));
}

export function serializeHistoryPrices(
  rows: PriceSnapshotRow[],
  usdRows: PriceSnapshotRow[],
  maxToleranceMs?: number
): Array<Record<string, any>> {
  const usdRates = usdRows
    .filter((r) => r.price_irr && r.price_irr > 0 && r.observed_at)
    .sort((a, b) => new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime());
  return rows.map((row) => serializePrice(row, usdRateFor(row, usdRates, maxToleranceMs)));
}

export function usdRateFor(
  row: PriceSnapshotRow,
  usdRates: PriceSnapshotRow[],
  maxToleranceMs?: number
): number | null {
  if (!usdRates.length || !row.observed_at) return null;
  const targetTime = new Date(row.observed_at).getTime();
  if (Number.isNaN(targetTime)) return null;

  let latestBefore: PriceSnapshotRow | null = null;
  let firstAfter: PriceSnapshotRow | null = null;

  for (const usd of usdRates) {
    if (!usd.observed_at) continue;
    const usdTime = new Date(usd.observed_at).getTime();
    if (Number.isNaN(usdTime)) continue;

    if (usdTime <= targetTime) {
      latestBefore = usd;
    } else {
      firstAfter = usd;
      break;
    }
  }

  let selected: PriceSnapshotRow | null = null;
  if (latestBefore && firstAfter) {
    const diffBefore = Math.abs(targetTime - new Date(latestBefore.observed_at).getTime());
    const diffAfter = Math.abs(new Date(firstAfter.observed_at).getTime() - targetTime);
    selected = diffBefore <= diffAfter ? latestBefore : firstAfter;
  } else {
    selected = latestBefore || firstAfter;
  }

  if (!selected || !selected.observed_at) return null;

  if (maxToleranceMs !== undefined && maxToleranceMs > 0) {
    const selectedTime = new Date(selected.observed_at).getTime();
    if (Math.abs(selectedTime - targetTime) > maxToleranceMs) {
      return null;
    }
  }

  return selected.price_irr ?? null;
}
