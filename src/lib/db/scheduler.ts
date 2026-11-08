import Database from 'better-sqlite3';
import { TargetConfig } from '../types';
import { USD_PRODUCT_KEY } from '../serializers';
import { FREE_PRODUCT_LIMIT } from './connection';
import {
  getDayBounds,
  getHourBounds,
  getTimezoneHour,
  isHourInWindow,
} from './schedulerTime';

export * from './schedulerTime';

export function isMarketSource(sourceKey?: string, adapter?: string): boolean {
  if (adapter === 'brsapi_market' || adapter === 'servix_market') return true;
  if (!sourceKey) return false;
  const lower = sourceKey.toLowerCase();
  return lower.includes('market') || lower.includes('servix') || lower.includes('brsapi');
}

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

  const users = db.prepare(`
    SELECT DISTINCT u.id, u.role, u.extra_slots, u.slot_expires_at
    FROM users u
    JOIN user_products up ON up.user_id = u.id
    WHERE up.product_key = ?
    UNION
    SELECT u.id, u.role, u.extra_slots, u.slot_expires_at
    FROM managed_products mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.key = ?
  `).all(productKey, productKey) as Array<{ id: number; role: string; extra_slots: number; slot_expires_at: string | null }>;

  if (users.length === 0) {
    return true;
  }

  for (const user of users) {
    if (user.role === 'admin') return true;

    const isSubscriptionActive = Boolean(
      (user.extra_slots || 0) > 0 &&
      (!user.slot_expires_at || new Date(user.slot_expires_at).getTime() > Date.now())
    );
    if (isSubscriptionActive) return true;

    const userFirstThree = db.prepare(`
      SELECT product_key FROM user_products
      WHERE user_id = ?
      ORDER BY id ASC
      LIMIT ?
    `).pluck().all(user.id, FREE_PRODUCT_LIMIT) as string[];

    if (userFirstThree.length === 0 || userFirstThree.includes(productKey)) {
      return true;
    }
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

  // 1. Hourly check for public targets: each public product has its configured active hour window
  const currentHour = getTimezoneHour(now);
  const publicScheduleMap = getPublicProductScheduleMap(db);

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

  // 2. Daily check for private targets: collected once a day across 24h
  const eligiblePrivate = privateTargets.filter(
    (t) => isProductEligibleForCollection(db, t.product_key) && !hasSuccessfulPriceToday(db, t.product_key, now, t.url, t.source_key)
  );

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
    targets: [...marketTargets, ...eligiblePublic, ...selectedPrivate],
    batchSize: effectiveBatchSize,
    totalManagedTargets: allActiveTargets.length,
    totalMarketTargets: marketTargets.length,
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
