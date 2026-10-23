import Database from 'better-sqlite3';
import path from 'path';
import {
  AppConfig,
  FetchErrorRow,
  ManagedProductRow,
  ManagedTargetRow,
  PriceObservation,
  PriceSnapshotRow,
  ProductConfig,
  RunRow,
  SafeUser,
  TargetConfig,
  UserRole,
  UserRow,
} from './types';

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

    CREATE TABLE IF NOT EXISTS managed_products (
      key VARCHAR(128) PRIMARY KEY,
      title TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      adapter_settings JSON NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_managed_targets_product_key ON managed_targets(product_key);
    CREATE INDEX IF NOT EXISTS ix_managed_targets_source_key ON managed_targets(source_key);

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

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(128) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'viewer',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);
  `);

  seedManagedProductsIfEmpty(db);
}

export function seedManagedProductsIfEmpty(db: Database.Database, initialConfig?: AppConfig): void {
  try {
    const countRow = db.prepare('SELECT count(*) as cnt FROM managed_products').get() as { cnt: number } | undefined;
    if (countRow && countRow.cnt > 0) {
      return;
    }

    const now = new Date().toISOString();
    const insertProd = db.prepare(
      'INSERT OR IGNORE INTO managed_products (key, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
    );
    const insertTgt = db.prepare(
      'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    // If initialConfig provided with products and targets, seed from it
    if (initialConfig && initialConfig.products && Object.keys(initialConfig.products).length > 0) {
      const txn = db.transaction(() => {
        for (const [key, p] of Object.entries(initialConfig.products!)) {
          insertProd.run(key, p.title, now, now);
        }
        for (const t of initialConfig.targets || []) {
          insertTgt.run(
            t.product_key,
            t.source_key,
            t.url,
            t.enabled ? 1 : 0,
            JSON.stringify(t.adapter_settings || {}),
            now,
            now
          );
        }
      });
      txn();
      return;
    }

    // Otherwise check if there are historical products in the database from past runs
    const run = latestRun(db);
    if (run) {
      const pastProducts = db.prepare('SELECT key, title FROM products WHERE run_id = ?').all(run.id) as Array<{
        key: string;
        title: string;
      }>;
      const pastTargets = db.prepare(
        'SELECT product_key, source_key, url, enabled, config_json FROM product_targets WHERE run_id = ?'
      ).all(run.id) as any[];
      if (pastProducts.length > 0) {
        const txn = db.transaction(() => {
          for (const p of pastProducts) {
            insertProd.run(p.key, p.title, now, now);
          }
          for (const t of pastTargets) {
            let adapterSettings = '{}';
            try {
              const parsed = JSON.parse(t.config_json);
              if (parsed.adapter_settings) adapterSettings = JSON.stringify(parsed.adapter_settings);
            } catch {}
            insertTgt.run(t.product_key, t.source_key, t.url, t.enabled ? 1 : 0, adapterSettings, now, now);
          }
        });
        txn();
        return;
      }
    }

    // Fallback: check distinct products/targets in the database
    const distinctProducts = db.prepare('SELECT DISTINCT key, title FROM products').all() as Array<{
      key: string;
      title: string;
    }>;
    if (distinctProducts.length > 0) {
      const distinctTargets = db.prepare(
        'SELECT DISTINCT product_key, source_key, url, enabled, config_json FROM product_targets'
      ).all() as any[];
      const txn = db.transaction(() => {
        for (const p of distinctProducts) {
          insertProd.run(p.key, p.title, now, now);
        }
        for (const t of distinctTargets) {
          let adapterSettings = '{}';
          try {
            const parsed = JSON.parse(t.config_json);
            if (parsed.adapter_settings) adapterSettings = JSON.stringify(parsed.adapter_settings);
          } catch {}
          insertTgt.run(t.product_key, t.source_key, t.url, t.enabled ? 1 : 0, adapterSettings, now, now);
        }
      });
      txn();
    }
  } catch (err) {
    console.warn('[DB] seedManagedProductsIfEmpty warning:', err);
  }
}

export function makeProductKey(
  title: string,
  existing: Record<string, any> | Set<string> | string[]
): string {
  let base = title.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  base = base.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!base) {
    base = 'product';
  }

  let candidate = base;
  let index = 2;
  const has = (k: string) => {
    if (existing instanceof Set) return existing.has(k);
    if (Array.isArray(existing)) return existing.includes(k);
    return k in existing;
  };
  while (has(candidate)) {
    candidate = `${base}-${index}`;
    index++;
  }
  return candidate;
}

export function getManagedProducts(db: Database.Database): ManagedProductRow[] {
  return db.prepare('SELECT * FROM managed_products ORDER BY key ASC').all() as ManagedProductRow[];
}

export function getManagedTargets(db: Database.Database, productKey?: string): ManagedTargetRow[] {
  if (productKey) {
    return db
      .prepare('SELECT * FROM managed_targets WHERE product_key = ? ORDER BY id ASC')
      .all(productKey) as ManagedTargetRow[];
  }
  return db.prepare('SELECT * FROM managed_targets ORDER BY id ASC').all() as ManagedTargetRow[];
}

export function addManagedProduct(
  db: Database.Database,
  options: { title: string; url: string; source_key?: string | null; key?: string }
): { product_key: string } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';

  const existing = new Set(
    (db.prepare('SELECT key FROM managed_products').all() as Array<{ key: string }>).map((r) => r.key)
  );

  let productKey = options.key?.trim();
  if (!productKey) {
    productKey = makeProductKey(cleanTitle, existing);
  } else if (existing.has(productKey)) {
    throw new Error(`product key already exists: ${productKey}`);
  }

  const now = new Date().toISOString();
  const insertProd = db.prepare(
    'INSERT INTO managed_products (key, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  );
  const insertTgt = db.prepare(
    'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    insertProd.run(productKey, cleanTitle, now, now);
    insertTgt.run(productKey, sourceKey, cleanUrl, '{}', now, now);
  });
  txn();

  return { product_key: productKey };
}

export function updateManagedProduct(
  db: Database.Database,
  productKey: string,
  options: { title: string; url: string; source_key?: string | null }
): { product_key: string } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';

  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey);
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    db.prepare('UPDATE managed_products SET title = ?, updated_at = ? WHERE key = ?').run(
      cleanTitle,
      now,
      productKey
    );
    const existingTarget = db
      .prepare('SELECT id FROM managed_targets WHERE product_key = ? LIMIT 1')
      .get(productKey) as { id: number } | undefined;
    if (existingTarget) {
      db.prepare('UPDATE managed_targets SET source_key = ?, url = ?, updated_at = ? WHERE id = ?').run(
        sourceKey,
        cleanUrl,
        now,
        existingTarget.id
      );
    } else {
      db.prepare(
        'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
      ).run(productKey, sourceKey, cleanUrl, '{}', now, now);
    }
  });
  txn();

  return { product_key: productKey };
}

export function deleteManagedProduct(db: Database.Database, productKey: string): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey);
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM managed_targets WHERE product_key = ?').run(productKey);
    db.prepare('DELETE FROM managed_products WHERE key = ?').run(productKey);
  });
  txn();

  return { product_key: productKey };
}

export function setManagedProductEnabled(
  db: Database.Database,
  productKey: string,
  enabled: boolean
): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey);
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const now = new Date().toISOString();
  db.prepare('UPDATE managed_targets SET enabled = ?, updated_at = ? WHERE product_key = ?').run(
    enabled ? 1 : 0,
    now,
    productKey
  );

  return { product_key: productKey };
}

export function startRun(
  db: Database.Database,
  configPath: string | null,
  config: AppConfig,
  targets?: TargetConfig[],
  products?: Record<string, ProductConfig>
): number {
  let effectiveTargets = targets;
  if (!effectiveTargets) {
    const managedTargets = getManagedTargets(db);
    if (managedTargets.length > 0) {
      effectiveTargets = managedTargets.map((t) => {
        let adapterSettings: Record<string, any> = {};
        try {
          adapterSettings = JSON.parse(t.adapter_settings || '{}');
        } catch {}
        return {
          product_key: t.product_key,
          source_key: t.source_key,
          url: t.url,
          enabled: Boolean(t.enabled),
          adapter_settings: adapterSettings,
        };
      });
    } else {
      effectiveTargets = config.targets || [];
    }
  }

  let effectiveProducts = products;
  if (!effectiveProducts) {
    const managedProds = getManagedProducts(db);
    if (managedProds.length > 0) {
      effectiveProducts = {};
      for (const p of managedProds) {
        effectiveProducts[p.key] = { title: p.title };
      }
    } else {
      effectiveProducts = config.products || {};
    }
  }

  const activeTargetsCount = effectiveTargets.filter((t) => t.enabled).length;
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
  for (const [key, product] of Object.entries(effectiveProducts)) {
    insertProduct.run(runId, key, product.title, JSON.stringify(product));
  }

  const insertTarget = db.prepare(`
    INSERT INTO product_targets (run_id, product_key, source_key, url, enabled, config_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const target of effectiveTargets) {
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

export function getUserByUsername(db: Database.Database, username: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
  return row || null;
}

export function getUserById(db: Database.Database, id: number): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row || null;
}

export function listUsers(db: Database.Database): SafeUser[] {
  const rows = db.prepare(`
    SELECT id, username, email, role, created_at, updated_at
    FROM users
    ORDER BY id ASC
  `).all() as SafeUser[];
  return rows;
}

export function countUsers(db: Database.Database): number {
  const row = db.prepare('SELECT count(*) as count FROM users').get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export function countAdmins(db: Database.Database): number {
  const row = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin'").get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export function createUser(
  db: Database.Database,
  params: { username: string; password_hash: string; email?: string | null; role?: UserRole }
): SafeUser {
  const now = new Date().toISOString();
  const role = params.role || 'viewer';
  const email = params.email || null;
  const username = params.username.trim();

  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(username, email, params.password_hash, role, now, now);
  const id = Number(result.lastInsertRowid);

  return {
    id,
    username,
    email,
    role,
    created_at: now,
    updated_at: now,
  };
}

export function updateUser(
  db: Database.Database,
  id: number,
  params: { password_hash?: string; role?: UserRole; email?: string | null }
): SafeUser {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  const now = new Date().toISOString();
  const nextPasswordHash = params.password_hash !== undefined ? params.password_hash : existing.password_hash;
  const nextRole = params.role !== undefined ? params.role : existing.role;
  const nextEmail = params.email !== undefined ? params.email : existing.email;

  if (existing.role === 'admin' && nextRole !== 'admin') {
    const adminCount = countAdmins(db);
    if (adminCount <= 1) {
      throw new Error('امکان تغییر نقش آخرین مدیر سیستم وجود ندارد.');
    }
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = ?, email = ?, updated_at = ?
    WHERE id = ?
  `).run(nextPasswordHash, nextRole, nextEmail, now, id);

  return {
    id,
    username: existing.username,
    email: nextEmail,
    role: nextRole,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function deleteUser(db: Database.Database, id: number): boolean {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  if (existing.role === 'admin') {
    const adminCount = countAdmins(db);
    if (adminCount <= 1) {
      throw new Error('امکان حذف آخرین مدیر سیستم وجود ندارد.');
    }
  }

  const res = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return res.changes > 0;
}

