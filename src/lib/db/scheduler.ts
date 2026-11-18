import Database from 'better-sqlite3';
import { TargetConfig } from '../types';
import { USD_PRODUCT_KEY } from '../serializers';
import { isMarketSource } from '../market';
import { FREE_PRODUCT_LIMIT } from './connection';
import {
  getDayBounds,
  getHourBounds,
  getTimezoneHour,
  isHourInWindow,
} from './schedulerTime';

export { isMarketSource } from '../market';
export * from './schedulerTime';

export function getPublicProductScheduleMap(
  db: Database.Database
): Map<string, { startHour: number; endHour: number }> {
  const rows = db
    .prepare('SELECT key, active_start_hour, active_end_hour FROM managed_products WHERE is_public = 1')
    .all() as Array<{
    key: string;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
  }>;

  const map = new Map<string, { startHour: number; endHour: number }>();
  for (const r of rows) {
    map.set(r.key, {
      startHour: r.active_start_hour ?? 8,
      endHour: r.active_end_hour ?? 23,
    });
  }
  return map;
}

/**
 * Collection window for every product (public or private), used by the runner to
 * decide whether a target may be fetched right now.
 */
export function getProductScheduleMap(
  db: Database.Database
): Map<string, { startHour: number; endHour: number }> {
  const rows = db
    .prepare('SELECT key, active_start_hour, active_end_hour FROM managed_products')
    .all() as Array<{
    key: string;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
  }>;

  const map = new Map<string, { startHour: number; endHour: number }>();
  for (const r of rows) {
    map.set(r.key, {
      startHour: r.active_start_hour ?? 8,
      endHour: r.active_end_hour ?? 23,
    });
  }
  return map;
}

export function getPublicProductKeys(db: Database.Database): Set<string> {
  const keys = db.prepare('SELECT key FROM managed_products WHERE is_public = 1').pluck().all() as string[];
  return new Set(keys);
}

export function isPublicProduct(db: Database.Database, productKey: string): boolean {
  const row = db.prepare('SELECT is_public FROM managed_products WHERE key = ?').get(productKey) as
    | { is_public?: number }
    | undefined;
  return Boolean(row && row.is_public === 1);
}

export function isProductEligibleForCollection(db: Database.Database, productKey: string): boolean {
  if (isPublicProduct(db, productKey)) return true;

  const trackers = db
    .prepare(`
      SELECT up.user_id, up.slot_expires_at, u.role
      FROM user_products up
      JOIN users u ON u.id = up.user_id
      WHERE up.product_key = ?
    `)
    .all(productKey) as Array<{ user_id: number; slot_expires_at: string | null; role: string }>;

  // No explicit tracker row (legacy/orphan product): keep collecting rather than
  // silently freezing a product someone may still be watching.
  if (trackers.length === 0) return true;

  const now = Date.now();

  for (const tracker of trackers) {
    if (tracker.role === 'admin') return true;

    if (tracker.slot_expires_at != null) {
      // Paid slot: collected while its own 30-day window is open.
      if (new Date(tracker.slot_expires_at).getTime() > now) return true;
      continue;
    }

    // Free slot: only the oldest FREE_PRODUCT_LIMIT free products are monitored.
    const freeKeys = db
      .prepare(
        `SELECT product_key FROM user_products
         WHERE user_id = ? AND slot_expires_at IS NULL
         ORDER BY id ASC LIMIT ?`
      )
      .pluck()
      .all(tracker.user_id, FREE_PRODUCT_LIMIT) as string[];

    if (freeKeys.includes(productKey)) return true;
  }

  return false;
}

export interface ScheduledBatchOptions {
  limit?: number;
  force?: boolean;
  spread?: boolean;
  runsPerDay?: number;
  now?: Date;
}

export interface ScheduledBatchResult {
  targets: TargetConfig[];
  batchSize: number;
  totalManagedTargets: number;
  totalMarketTargets: number;
  eligibleMarketTargets?: number;
  totalNonMarketTargets: number;
  totalEligibleNonMarket: number;
  remainingToday: number;
  totalPublicTargets?: number;
  eligiblePublicTargets?: number;
  totalPrivateTargets?: number;
  eligiblePrivateTargets?: number;
  isPublicCollectionHour?: boolean;
}

export function getScheduledBatchTargets(
  db: Database.Database,
  allActiveTargets: TargetConfig[],
  options: ScheduledBatchOptions = {}
): ScheduledBatchResult {
  const { limit, force = false, spread = true, runsPerDay = 24, now = new Date() } = options;

  const marketTargets: TargetConfig[] = [];
  const publicTargets: TargetConfig[] = [];
  const privateTargets: TargetConfig[] = [];

  const publicKeys = getPublicProductKeys(db);

  for (const t of allActiveTargets) {
    if (isMarketSource(t.source_key) || t.product_key === USD_PRODUCT_KEY) {
      marketTargets.push(t);
    } else if (publicKeys.has(t.product_key)) {
      publicTargets.push(t);
    } else {
      privateTargets.push(t);
    }
  }

  const nonMarketTargets = [...publicTargets, ...privateTargets];

  if (force || !spread) {
    const validTargets = force ? allActiveTargets : allActiveTargets.filter((t) => isProductEligibleForCollection(db, t.product_key));
    return {
      targets: validTargets,
      batchSize: validTargets.length,
      totalManagedTargets: allActiveTargets.length,
      totalMarketTargets: marketTargets.length,
      eligibleMarketTargets: marketTargets.length,
      totalNonMarketTargets: nonMarketTargets.length,
      totalEligibleNonMarket: nonMarketTargets.length,
      remainingToday: 0,
      totalPublicTargets: publicTargets.length,
      eligiblePublicTargets: publicTargets.length,
      totalPrivateTargets: privateTargets.length,
      eligiblePrivateTargets: privateTargets.length,
      isPublicCollectionHour: true,
    };
  }

  // 1. Hourly check for public and market targets: each product has its own window
  const currentHour = getTimezoneHour(now);
  const publicScheduleMap = getPublicProductScheduleMap(db);
  const scheduleMap = getProductScheduleMap(db);

  // Market products only need their window checked here. The runner fetches the
  // whole source snapshot once and enforces the poll interval per source, so
  // individual market products must not be filtered out separately.
  const eligibleMarket = marketTargets.filter((t) => {
    const sched = scheduleMap.get(t.product_key) ?? { startHour: 0, endHour: 23 };
    return isHourInWindow(currentHour, sched.startHour, sched.endHour);
  });

  const isPublicCollectionHour =
    publicTargets.length > 0
      ? publicTargets.some((t) => {
          const sched = publicScheduleMap.get(t.product_key) ?? { startHour: 8, endHour: 23 };
          return isHourInWindow(currentHour, sched.startHour, sched.endHour);
        })
      : currentHour >= 8 && currentHour <= 23;

  const eligiblePublic: TargetConfig[] = publicTargets.filter((t) => {
    const sched = publicScheduleMap.get(t.product_key) ?? { startHour: 8, endHour: 23 };
    if (!isHourInWindow(currentHour, sched.startHour, sched.endHour)) {
      return false;
    }
    return !hasSuccessfulPriceThisHour(db, t.product_key, now, t.url, t.source_key);
  });

  // 2. Daily check for private targets: collected once a day, inside their window
  const eligiblePrivate = privateTargets.filter((t) => {
    const sched = scheduleMap.get(t.product_key) ?? { startHour: 0, endHour: 23 };
    if (!isHourInWindow(currentHour, sched.startHour, sched.endHour)) {
      return false;
    }
    return (
      isProductEligibleForCollection(db, t.product_key) &&
      !hasSuccessfulPriceToday(db, t.product_key, now, t.url, t.source_key)
    );
  });

  // If there are eligible private targets, prioritize LRU based on last attempt timestamp
  if (eligiblePrivate.length > 0) {
    const attempts = db.prepare(`
      SELECT product_key, url, MAX(observed_at) as last_time
      FROM (
        SELECT product_key, url, observed_at FROM price_snapshots
        UNION ALL
        SELECT product_key, url, observed_at FROM fetch_errors
      )
      GROUP BY product_key, url
    `).all() as { product_key: string; url: string; last_time: string }[];

    const lastAttemptMap = new Map<string, string>();
    for (const row of attempts) {
      lastAttemptMap.set(`${row.product_key}:::${row.url}`, row.last_time);
    }

    eligiblePrivate.sort((a, b) => {
      const timeA = lastAttemptMap.get(`${a.product_key}:::${a.url}`) || '';
      const timeB = lastAttemptMap.get(`${b.product_key}:::${b.url}`) || '';
      if (!timeA && !timeB) return 0;
      if (!timeA) return -1; // null/unattempted first
      if (!timeB) return 1;
      return timeA.localeCompare(timeB); // oldest first
    });
  }

  let effectiveBatchSize: number;
  if (typeof limit === 'number' && limit > 0) {
    effectiveBatchSize = limit;
  } else if (process.env.PRICE_GETTER_BATCH_SIZE && parseInt(process.env.PRICE_GETTER_BATCH_SIZE, 10) > 0) {
    effectiveBatchSize = parseInt(process.env.PRICE_GETTER_BATCH_SIZE, 10);
  } else {
    const rpd = process.env.CRON_RUNS_PER_DAY ? parseInt(process.env.CRON_RUNS_PER_DAY, 10) : runsPerDay;
    effectiveBatchSize = Math.max(1, Math.ceil(privateTargets.length / Math.max(1, rpd)));
  }

  const selectedPrivate = eligiblePrivate.slice(0, effectiveBatchSize);
  const remainingToday = Math.max(0, eligiblePrivate.length - selectedPrivate.length);

  return {
    targets: [...eligibleMarket, ...eligiblePublic, ...selectedPrivate],
    batchSize: effectiveBatchSize,
    totalManagedTargets: allActiveTargets.length,
    totalMarketTargets: marketTargets.length,
    eligibleMarketTargets: eligibleMarket.length,
    totalNonMarketTargets: nonMarketTargets.length,
    totalEligibleNonMarket: eligiblePublic.length + eligiblePrivate.length,
    remainingToday,
    totalPublicTargets: publicTargets.length,
    eligiblePublicTargets: eligiblePublic.length,
    totalPrivateTargets: privateTargets.length,
    eligiblePrivateTargets: eligiblePrivate.length,
    isPublicCollectionHour,
  };
}

export function hasSuccessfulPriceToday(
  db: Database.Database,
  productKey: string,
  now = new Date(),
  url?: string,
  sourceKey?: string
): boolean {
  const { startOfDay, endOfDay } = getDayBounds(now);
  const isMarket = isMarketSource(sourceKey);

  let row;
  if (url && !isMarket) {
    row = db.prepare(`
      SELECT id FROM price_snapshots
      WHERE (product_key = ? OR (url = ? AND source_key NOT LIKE '%market%' AND source_key NOT LIKE '%servix%' AND source_key NOT LIKE '%brsapi%' AND source_key NOT LIKE '%iranjib%'))
        AND price_irr IS NOT NULL
        AND observed_at >= ?
        AND observed_at <= ?
      LIMIT 1
    `).get(productKey, url, startOfDay, endOfDay);
  } else {
    row = db.prepare(`
      SELECT id FROM price_snapshots
      WHERE product_key = ?
        AND price_irr IS NOT NULL
        AND observed_at >= ?
        AND observed_at <= ?
      LIMIT 1
    `).get(productKey, startOfDay, endOfDay);
  }

  return !!row;
}


/** Default market polling interval: once per hour keeps a 50 req/day quota safe. */
export const DEFAULT_MARKET_POLL_INTERVAL_MINUTES = 60;

/**
 * Polling interval for market products (USD/gold/coin). Providers such as Servix
 * allow only a few dozen requests per day, so the interval is configurable per
 * source via `managed_sources.settings.market_poll_interval_minutes`, with the
 * `MARKET_POLL_INTERVAL_MINUTES` environment variable as a global override.
 */
export function getMarketPollIntervalMinutes(
  db: Database.Database,
  sourceKey?: string | null
): number {
  const fromEnv = Number(process.env.MARKET_POLL_INTERVAL_MINUTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }

  if (sourceKey) {
    try {
      const row = db
        .prepare('SELECT settings FROM managed_sources WHERE key = ?')
        .get(sourceKey) as { settings?: string } | undefined;
      if (row?.settings) {
        const settings = JSON.parse(row.settings);
        const configured = Number(settings?.market_poll_interval_minutes);
        if (Number.isFinite(configured) && configured > 0) {
          return Math.floor(configured);
        }
      }
    } catch {
      // Fall through to the default interval.
    }
  }

  return DEFAULT_MARKET_POLL_INTERVAL_MINUTES;
}

/**
 * True when a successful snapshot exists within the last `minutes` minutes.
 * Used to throttle market products independently of the hourly window.
 */
export function hasSuccessfulPriceWithinMinutes(
  db: Database.Database,
  productKey: string,
  minutes: number,
  now = new Date()
): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  const since = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
  const until = now.toISOString();

  const row = db
    .prepare(`
      SELECT id FROM price_snapshots
      WHERE product_key = ?
        AND price_irr IS NOT NULL
        AND observed_at >= ?
        AND observed_at <= ?
      LIMIT 1
    `)
    .get(productKey, since, until);

  return !!row;
}

export function hasSuccessfulPriceThisHour(
  db: Database.Database,
  productKey: string,
  now = new Date(),
  url?: string,
  sourceKey?: string
): boolean {
  const { startOfHour, endOfHour } = getHourBounds(now);
  const isMarket = isMarketSource(sourceKey);

  let row;
  if (url && !isMarket) {
    row = db.prepare(`
      SELECT id FROM price_snapshots
      WHERE (product_key = ? OR (url = ? AND source_key NOT LIKE '%market%' AND source_key NOT LIKE '%servix%' AND source_key NOT LIKE '%brsapi%' AND source_key NOT LIKE '%iranjib%'))
        AND price_irr IS NOT NULL
        AND observed_at >= ?
        AND observed_at <= ?
      LIMIT 1
    `).get(productKey, url, startOfHour, endOfHour);
  } else {
    row = db.prepare(`
      SELECT id FROM price_snapshots
      WHERE product_key = ?
        AND price_irr IS NOT NULL
        AND observed_at >= ?
        AND observed_at <= ?
      LIMIT 1
    `).get(productKey, startOfHour, endOfHour);
  }

  return !!row;
}
