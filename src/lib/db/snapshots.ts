import Database from 'better-sqlite3';
import { PriceObservation, PriceSnapshotRow, TargetConfig } from '../types';

export function recordPrice(
  db: Database.Database,
  runId: number,
  target: TargetConfig,
  observation: PriceObservation
): number {
  const observedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_snapshots (
      run_id, product_key, source_key, url, title, seller, price_irr, availability, observed_at, raw_observation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    runId,
    target.product_key,
    target.source_key,
    target.url,
    observation.title ?? null,
    observation.seller ?? null,
    observation.price_irr ?? null,
    observation.availability,
    observedAt,
    JSON.stringify(observation.raw_observation ?? {})
  );
  return Number(res.lastInsertRowid);
}

export function latestSnapshots(
  db: Database.Database,
  limit = 100,
  allowedProductKeys?: string[] | Set<string>
): PriceSnapshotRow[] {
  const allowedSet = allowedProductKeys
    ? (allowedProductKeys instanceof Set ? allowedProductKeys : new Set(allowedProductKeys))
    : null;

  // Return latest snapshot for each (product_key, source_key) with previous different price
  const rows = db.prepare(`
    SELECT * FROM price_snapshots
    ORDER BY observed_at DESC, id DESC
  `).all() as PriceSnapshotRow[];

  const seen = new Set<string>();
  const hasDiff = new Set<string>();
  const samePriceFallback = new Map<string, PriceSnapshotRow>();
  const latestMap = new Map<string, PriceSnapshotRow>();
  const latestOrder: string[] = [];

  for (const row of rows) {
    if (allowedSet && !allowedSet.has(row.product_key)) {
      continue;
    }
    const key = `${row.product_key}:${row.source_key}`;
    if (!seen.has(key)) {
      if (latestOrder.length < limit) {
        seen.add(key);
        latestMap.set(key, { ...row });
        latestOrder.push(key);
      }
    } else if (!hasDiff.has(key) && row.price_irr !== null && row.price_irr !== undefined) {
      const latestItem = latestMap.get(key);
      if (latestItem && latestItem.price_irr !== null && latestItem.price_irr !== undefined) {
        if (row.price_irr !== latestItem.price_irr) {
          hasDiff.add(key);
          latestItem.previous_price_irr = row.price_irr;
          latestItem.previous_observed_at = row.observed_at;
        } else if (!samePriceFallback.has(key)) {
          samePriceFallback.set(key, row);
        }
      }
    }
  }

  // If price never changed historically across runs, fall back to identical price
  for (const [key, fallback] of samePriceFallback.entries()) {
    if (!hasDiff.has(key)) {
      const latestItem = latestMap.get(key);
      if (latestItem) {
        latestItem.previous_price_irr = fallback.price_irr;
        latestItem.previous_observed_at = fallback.observed_at;
      }
    }
  }

  return latestOrder.slice(0, limit).map((key) => latestMap.get(key)!);
}

export function productHistory(
  db: Database.Database,
  productKey: string,
  sourceKey?: string | null,
  limit = 50
): PriceSnapshotRow[] {
  if (sourceKey) {
    return db.prepare(`
      SELECT * FROM price_snapshots
      WHERE product_key = ? AND source_key = ?
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(productKey, sourceKey, limit) as PriceSnapshotRow[];
  }
  return db.prepare(`
    SELECT * FROM price_snapshots
    WHERE product_key = ?
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(productKey, limit) as PriceSnapshotRow[];
}

export function productHistoryChronological(
  db: Database.Database,
  productKey: string,
  sourceKey?: string | null,
  limit = 200
): PriceSnapshotRow[] {
  const rows = productHistory(db, productKey, sourceKey, limit);
  return rows.reverse();
}
