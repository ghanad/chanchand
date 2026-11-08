import Database from 'better-sqlite3';
import { FetchErrorRow, TargetConfig } from '../types';

export function recordError(
  db: Database.Database,
  runId: number,
  target: TargetConfig,
  error: Error | any,
  rawObservation?: Record<string, any>
): number {
  const observedAt = new Date().toISOString();
  const errorType = error?.name || 'Error';
  const message = error?.message || String(error);
  const stmt = db.prepare(`
    INSERT INTO fetch_errors (
      run_id, product_key, source_key, url, error_type, message, observed_at, raw_observation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    runId,
    target.product_key,
    target.source_key,
    target.url,
    errorType,
    message,
    observedAt,
    JSON.stringify(rawObservation ?? {})
  );
  return Number(res.lastInsertRowid);
}

export function recentErrors(
  db: Database.Database,
  limit = 50,
  allowedProductKeys?: string[] | Set<string>
): FetchErrorRow[] {
  if (allowedProductKeys) {
    const allowedArr = Array.from(allowedProductKeys);
    if (allowedArr.length === 0) return [];
    const placeholders = allowedArr.map(() => '?').join(',');
    return db.prepare(`
      SELECT * FROM fetch_errors
      WHERE product_key IN (${placeholders})
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(...allowedArr, limit) as FetchErrorRow[];
  }

  return db.prepare(`
    SELECT * FROM fetch_errors
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(limit) as FetchErrorRow[];
}
