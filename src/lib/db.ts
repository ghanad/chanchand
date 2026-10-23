import Database from 'better-sqlite3';
import path from 'path';
import { AppConfig, FetchErrorRow, PriceObservation, PriceSnapshotRow, RunRow, TargetConfig } from './types';

export const DEFAULT_DB_URL = 'sqlite:///price_getter.db';

export function resolveDbPath(dbUrl?: string): string {
  const url = dbUrl || process.env.PRICE_GETTER_DB_URL || DEFAULT_DB_URL;
  if (url.startsWith('sqlite:////')) {
    return '/' + url.slice('sqlite:////'.length);
  }
  if (url.startsWith('sqlite:///')) {
    const rawPath = url.slice('sqlite:///'.length);
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.isAbsolute(url) ? url : path.resolve(process.cwd(), url);
}

export function getDatabase(dbUrl?: string): Database.Database {
  const dbPath = resolveDbPath(dbUrl);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initDatabase(db);
  return db;
}

export function initDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME NOT NULL,
      finished_at DATETIME,
      status VARCHAR(32) NOT NULL DEFAULT 'running',
      config_path TEXT,
      target_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      key VARCHAR(128) NOT NULL,
      adapter VARCHAR(64) NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sources_run_id ON sources(run_id);
    CREATE INDEX IF NOT EXISTS ix_sources_key ON sources(key);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      key VARCHAR(128) NOT NULL,
      title TEXT NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_products_run_id ON products(run_id);
    CREATE INDEX IF NOT EXISTS ix_products_key ON products(key);

    CREATE TABLE IF NOT EXISTS product_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_product_targets_run_id ON product_targets(run_id);
    CREATE INDEX IF NOT EXISTS ix_product_targets_product_key ON product_targets(product_key);
    CREATE INDEX IF NOT EXISTS ix_product_targets_source_key ON product_targets(source_key);

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      seller TEXT,
      price_irr INTEGER,
      availability VARCHAR(32) NOT NULL DEFAULT 'unknown',
      observed_at DATETIME NOT NULL,
      raw_observation JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_run_id ON price_snapshots(run_id);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_product_key ON price_snapshots(product_key);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_source_key ON price_snapshots(source_key);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_observed_at ON price_snapshots(observed_at);

    CREATE TABLE IF NOT EXISTS fetch_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      error_type VARCHAR(128) NOT NULL,
      message TEXT NOT NULL,
      observed_at DATETIME NOT NULL,
      raw_observation JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_run_id ON fetch_errors(run_id);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_product_key ON fetch_errors(product_key);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_source_key ON fetch_errors(source_key);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_observed_at ON fetch_errors(observed_at);
  `);
}

export function startRun(db: Database.Database, configPath: string | null, config: AppConfig): number {
  const activeTargetsCount = config.targets.filter((t) => t.enabled).length;
  const startedAt = new Date().toISOString();

  const insertRun = db.prepare(`
    INSERT INTO runs (started_at, status, config_path, target_count, success_count, error_count)
    VALUES (?, 'running', ?, ?, 0, 0)
  `);
  const result = insertRun.run(startedAt, configPath, activeTargetsCount);
  const runId = Number(result.lastInsertRowid);

  const insertSource = db.prepare(`
    INSERT INTO sources (run_id, key, adapter, config_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, source] of Object.entries(config.sources)) {
    insertSource.run(runId, key, source.adapter, JSON.stringify(source));
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (run_id, key, title, config_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, product] of Object.entries(config.products)) {
    insertProduct.run(runId, key, product.title, JSON.stringify(product));
  }

  const insertTarget = db.prepare(`
    INSERT INTO product_targets (run_id, product_key, source_key, url, enabled, config_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const target of config.targets) {
    insertTarget.run(
      runId,
      target.product_key,
      target.source_key,
      target.url,
      target.enabled ? 1 : 0,
      JSON.stringify(target)
    );
  }

  return runId;
}

export function finishRun(
  db: Database.Database,
  runId: number,
  successCount: number,
  errorCount: number,
  targetCount: number
): void {
  const finishedAt = new Date().toISOString();
  let status = 'success';
  if (errorCount === 0) {
    status = 'success';
  } else if (successCount === 0 && targetCount > 0) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  db.prepare(`
    UPDATE runs
    SET finished_at = ?, status = ?, success_count = ?, error_count = ?
    WHERE id = ?
  `).run(finishedAt, status, successCount, errorCount, runId);
}

export function markRunFailed(db: Database.Database, runId: number): void {
  const finishedAt = new Date().toISOString();
  db.prepare(`
    UPDATE runs
    SET finished_at = ?, status = 'failed'
    WHERE id = ?
  `).run(finishedAt, runId);
}

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

export function hasSuccessfulPriceToday(db: Database.Database, productKey: string, now = new Date()): boolean {
  // Start of day in local time, converted to ISO / UTC
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  const row = db.prepare(`
    SELECT id FROM price_snapshots
    WHERE product_key = ?
      AND price_irr IS NOT NULL
      AND observed_at >= ?
      AND observed_at <= ?
    LIMIT 1
  `).get(productKey, startOfDay, endOfDay);

  return !!row;
}

export function latestSnapshots(db: Database.Database, limit = 100): PriceSnapshotRow[] {
  // Return latest snapshot for each (product_key, source_key)
  const rows = db.prepare(`
    SELECT * FROM price_snapshots
    ORDER BY observed_at DESC, id DESC
  `).all() as PriceSnapshotRow[];

  const seen = new Set<string>();
  const latest: PriceSnapshotRow[] = [];
  for (const row of rows) {
    const key = `${row.product_key}:${row.source_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
    if (latest.length >= limit) break;
  }
  return latest;
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

export function recentErrors(db: Database.Database, limit = 50): FetchErrorRow[] {
  return db.prepare(`
    SELECT * FROM fetch_errors
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(limit) as FetchErrorRow[];
}

export function recentRuns(db: Database.Database, limit = 20): RunRow[] {
  return db.prepare(`
    SELECT * FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `).all(limit) as RunRow[];
}

export function latestRun(db: Database.Database): RunRow | null {
  return (db.prepare(`
    SELECT * FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get() as RunRow) || null;
}

export function productsFromLatestRun(db: Database.Database): Array<{ id: number; run_id: number; key: string; title: string; config_json: string }> {
  const run = latestRun(db);
  if (!run) return [];
  return db.prepare(`
    SELECT * FROM products
    WHERE run_id = ?
    ORDER BY key
  `).all(run.id) as any;
}

export function sourcesFromLatestRun(db: Database.Database): Array<{ id: number; run_id: number; key: string; adapter: string; config_json: string }> {
  const run = latestRun(db);
  if (!run) return [];
  return db.prepare(`
    SELECT * FROM sources
    WHERE run_id = ?
    ORDER BY key
  `).all(run.id) as any;
}
