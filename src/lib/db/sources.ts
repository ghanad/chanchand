import Database from 'better-sqlite3';
import { ManagedSourceRow, SourceConfig } from '../types';

export function getManagedSources(db: Database.Database): ManagedSourceRow[] {
  return db.prepare('SELECT * FROM managed_sources ORDER BY key ASC').all() as ManagedSourceRow[];
}

export function getSourcesMap(db: Database.Database): Record<string, SourceConfig> {
  const rows = getManagedSources(db);
  const map: Record<string, SourceConfig> = {};
  for (const r of rows) {
    let headers: Record<string, string> = {};
    let settings: Record<string, any> = {};
    try {
      headers = JSON.parse(r.headers || '{}');
    } catch {}
    try {
      settings = JSON.parse(r.settings || '{}');
    } catch {}
    map[r.key] = {
      adapter: r.adapter,
      timeout_seconds: r.timeout_seconds,
      rate_limit_seconds: r.rate_limit_seconds,
      currency: r.currency,
      price_multiplier: r.price_multiplier,
      headers,
      settings,
    };
  }
  return map;
}

export function addManagedSource(
  db: Database.Database,
  options: {
    key: string;
    adapter: string;
    timeout_seconds?: number;
    rate_limit_seconds?: number;
    currency?: string;
    price_multiplier?: number;
    headers?: Record<string, string>;
    settings?: Record<string, any>;
  }
): { source_key: string } {
  const key = options.key.trim();
  if (!key) throw new Error('source key cannot be empty');
  const adapter = options.adapter.trim();
  if (!adapter) throw new Error('adapter cannot be empty');

  const existing = db.prepare('SELECT key FROM managed_sources WHERE key = ?').get(key);
  if (existing) {
    throw new Error(`source key already exists: ${key}`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO managed_sources (
      key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    key,
    adapter,
    options.timeout_seconds ?? 15,
    options.rate_limit_seconds ?? 2,
    options.currency || 'IRR',
    options.price_multiplier ?? 1,
    JSON.stringify(options.headers || {}),
    JSON.stringify(options.settings || {}),
    now,
    now
  );

  return { source_key: key };
}

export function updateManagedSource(
  db: Database.Database,
  key: string,
  options: {
    adapter?: string;
    timeout_seconds?: number;
    rate_limit_seconds?: number;
    currency?: string;
    price_multiplier?: number;
    headers?: Record<string, string>;
    settings?: Record<string, any>;
  }
): { source_key: string } {
  const existing = db.prepare('SELECT * FROM managed_sources WHERE key = ?').get(key) as
    | ManagedSourceRow
    | undefined;
  if (!existing) {
    throw new Error(`unknown source: ${key}`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE managed_sources
    SET adapter = ?, timeout_seconds = ?, rate_limit_seconds = ?, currency = ?, price_multiplier = ?, headers = ?, settings = ?, updated_at = ?
    WHERE key = ?
  `).run(
    options.adapter ?? existing.adapter,
    options.timeout_seconds ?? existing.timeout_seconds,
    options.rate_limit_seconds ?? existing.rate_limit_seconds,
    options.currency ?? existing.currency,
    options.price_multiplier ?? existing.price_multiplier,
    options.headers ? JSON.stringify(options.headers) : existing.headers,
    options.settings ? JSON.stringify(options.settings) : existing.settings,
    now,
    key
  );

  return { source_key: key };
}

export function deleteManagedSource(db: Database.Database, key: string): { source_key: string } {
  const existing = db.prepare('SELECT * FROM managed_sources WHERE key = ?').get(key);
  if (!existing) {
    throw new Error(`unknown source: ${key}`);
  }

  const linkedTargets = db
    .prepare('SELECT COUNT(*) as count FROM managed_targets WHERE source_key = ?')
    .get(key) as { count: number };
  if (linkedTargets && linkedTargets.count > 0) {
    throw new Error(
      `امکان حذف این منبع وجود ندارد زیرا در ${linkedTargets.count} هدف قیمت‌گیری متصل به محصولات استفاده شده است.`
    );
  }

  db.prepare('DELETE FROM managed_sources WHERE key = ?').run(key);
  return { source_key: key };
}
