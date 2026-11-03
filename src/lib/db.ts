import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  AppConfig,
  FetchErrorRow,
  ManagedProductRow,
  ManagedSourceRow,
  ManagedTargetRow,
  PriceObservation,
  PriceSnapshotRow,
  ProductConfig,
  PackageRow,
  PaymentStatus,
  PaymentTransactionRow,
  RunRow,
  SafeUser,
  SourceConfig,
  TargetConfig,
  UserProductRow,
  UserQuota,
  UserRole,
  UserRow,
  WalletTransactionRow,
} from './types';
import { normalizeTargetUrl, getTargetDeduplicationKey } from './urls';
import { USD_PRODUCT_KEY } from './serializers';

export const DEFAULT_DB_URL = 'sqlite:///data/price_getter.db';
export const FREE_PRODUCT_LIMIT = 3;
export const DEFAULT_SLOT_PRICE_TOMAN = 50000;

export function getSlotPriceToman(): number {
  const envVal = process.env.SLOT_PRICE_TOMAN;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SLOT_PRICE_TOMAN;
}

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
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
      error_count INTEGER NOT NULL DEFAULT 0,
      trigger_source VARCHAR(64) DEFAULT 'manual',
      trigger_details TEXT
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
      user_id INTEGER REFERENCES users(id),
      is_public INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS managed_sources (
      key VARCHAR(128) PRIMARY KEY,
      adapter VARCHAR(64) NOT NULL,
      timeout_seconds REAL NOT NULL DEFAULT 15.0,
      rate_limit_seconds REAL NOT NULL DEFAULT 2.0,
      currency VARCHAR(16) NOT NULL DEFAULT 'IRR',
      price_multiplier INTEGER NOT NULL DEFAULT 1,
      headers JSON NOT NULL DEFAULT '{}',
      settings JSON NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(128) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'viewer',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      wallet_balance INTEGER NOT NULL DEFAULT 0,
      extra_slots INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS user_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_key VARCHAR(128) NOT NULL REFERENCES managed_products(key) ON DELETE CASCADE,
      custom_title TEXT,
      created_at DATETIME NOT NULL,
      UNIQUE(user_id, product_key)
    );
    CREATE INDEX IF NOT EXISTS ix_user_products_user_id ON user_products(user_id);
    CREATE INDEX IF NOT EXISTS ix_user_products_product_key ON user_products(product_key);

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL,
      description TEXT,
      created_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_id ON wallet_transactions(user_id);
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key VARCHAR(64) UNIQUE NOT NULL,
      title VARCHAR(128) NOT NULL,
      slots INTEGER NOT NULL,
      price_toman INTEGER NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_packages_key ON packages(key);
    CREATE INDEX IF NOT EXISTS ix_packages_is_active ON packages(is_active);

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id INTEGER REFERENCES packages(id),
      package_title VARCHAR(128) NOT NULL,
      slots INTEGER NOT NULL,
      amount_toman INTEGER NOT NULL,
      gateway VARCHAR(64) NOT NULL,
      authority VARCHAR(128) UNIQUE,
      ref_id VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      meta JSON NOT NULL DEFAULT '{}',
      paid_at DATETIME,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_user_id ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_authority ON payment_transactions(authority);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_status ON payment_transactions(status);
  `);

  try {
    const runColumns = db.prepare('PRAGMA table_info(runs)').all() as { name: string }[];
    if (runColumns.length > 0) {
      if (!runColumns.some((col) => col.name === 'trigger_source')) {
        db.prepare("ALTER TABLE runs ADD COLUMN trigger_source VARCHAR(64) DEFAULT 'manual'").run();
      }
      if (!runColumns.some((col) => col.name === 'trigger_details')) {
        db.prepare('ALTER TABLE runs ADD COLUMN trigger_details TEXT').run();
      }
      db.exec('CREATE INDEX IF NOT EXISTS ix_runs_trigger_source ON runs(trigger_source);');
    }
  } catch (err) {
    console.warn('[DB] runs table migration warning:', err);
  }

  try {
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (userColumns.length > 0) {
      if (!userColumns.some((col) => col.name === 'must_change_password')) {
        db.prepare('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0').run();
      }
      if (!userColumns.some((col) => col.name === 'wallet_balance')) {
        db.prepare('ALTER TABLE users ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 0').run();
      }
      if (!userColumns.some((col) => col.name === 'extra_slots')) {
        db.prepare('ALTER TABLE users ADD COLUMN extra_slots INTEGER NOT NULL DEFAULT 0').run();
      }
      if (!userColumns.some((col) => col.name === 'mobile')) {
        db.prepare('ALTER TABLE users ADD COLUMN mobile VARCHAR(32)').run();
      }
    }
  } catch {
    // Migration skipped if already present or table not yet accessible
  }

  try {
    const pkgCount = (db.prepare('SELECT count(*) as count FROM packages').get() as { count: number })?.count ?? 0;
    if (pkgCount === 0) {
      const now = new Date().toISOString();
      const insertPkg = db.prepare(`
        INSERT INTO packages (key, title, slots, price_toman, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `);
      insertPkg.run('pkg_5', 'بسته ۵ تایی محصول', 5, 75000, 'امکان پایش ۵ محصول جدید اضافه به صورت دائمی', now, now);
      insertPkg.run('pkg_10', 'بسته ۱۰ تایی محصول', 10, 140000, 'امکان پایش ۱۰ محصول جدید اضافه به صورت دائمی (تخفیف ویژه)', now, now);
      insertPkg.run('pkg_25', 'بسته ۲۵ تایی محصول', 25, 300000, 'امکان پایش ۲۵ محصول جدید اضافه برای کاربران حرفه‌ای', now, now);
    }
  } catch (err) {
    console.warn('[DB] packages seed warning:', err);
  }

  try {
    const prodColumns = db.prepare('PRAGMA table_info(managed_products)').all() as { name: string }[];
    if (prodColumns.length > 0) {
      if (!prodColumns.some((col) => col.name === 'user_id')) {
        db.prepare('ALTER TABLE managed_products ADD COLUMN user_id INTEGER REFERENCES users(id)').run();
      }
      if (!prodColumns.some((col) => col.name === 'is_public')) {
        db.prepare('ALTER TABLE managed_products ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0').run();
      }

      // Backfill user_id for existing products to first admin if available
      const adminUser = db
        .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
        .get() as { id: number } | undefined;
      if (adminUser) {
        db.prepare('UPDATE managed_products SET user_id = ? WHERE user_id IS NULL').run(adminUser.id);
      }

      // Default all existing products without an explicit owner or known market products to is_public = 1
      db.prepare(`
        UPDATE managed_products
        SET is_public = 1
        WHERE key IN ('usd', 'gold', 'coin', 'sekkeh', 'tala')
           OR key LIKE '%gold%'
           OR key LIKE '%coin%'
           OR key LIKE '%usd%'
           OR key LIKE '%dollar%'
           OR key IN (
             SELECT product_key FROM managed_targets
             WHERE source_key LIKE '%brsapi%' OR source_key LIKE '%servix%'
           )
     `).run();

     db.exec(`
        CREATE INDEX IF NOT EXISTS ix_managed_products_user_id ON managed_products(user_id);
        CREATE INDEX IF NOT EXISTS ix_managed_products_is_public ON managed_products(is_public);
      `);
    }
  } catch (err) {
    console.warn('[DB] managed_products migration warning:', err);
  }

  try {
    // Backfill user_products from managed_products where user_id is set
    db.exec(`
      INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at)
      SELECT user_id, key, title, created_at
      FROM managed_products
      WHERE user_id IS NOT NULL;
    `);

    // Consolidate any duplicate targets using normalized URL and symbol for market endpoints
    const allTargets = db.prepare('SELECT * FROM managed_targets ORDER BY id ASC').all() as ManagedTargetRow[];
    const seenTargetKeys = new Map<string, string>();
    for (const tgt of allTargets) {
      const dedupKey = getTargetDeduplicationKey(tgt.source_key, tgt.url, tgt.adapter_settings);
      if (!dedupKey) continue;
      const canonicalKey = seenTargetKeys.get(dedupKey);
      if (!canonicalKey) {
        seenTargetKeys.set(dedupKey, tgt.product_key);
      } else if (canonicalKey !== tgt.product_key) {
        // Re-point any user_products pointing to duplicate product_key to canonicalKey
        db.prepare(`
          INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at)
          SELECT user_id, ?, custom_title, created_at FROM user_products WHERE product_key = ?
        `).run(canonicalKey, tgt.product_key);
        db.prepare('DELETE FROM user_products WHERE product_key = ?').run(tgt.product_key);
        db.prepare('DELETE FROM managed_targets WHERE id = ?').run(tgt.id);
        db.prepare('DELETE FROM managed_products WHERE key = ?').run(tgt.product_key);
      }
    }

    // Restore any market products from historical snapshots that were erroneously pruned by earlier URL-only deduplication
    const adminUser = db
      .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
      .get() as { id: number } | undefined;
    const adminId = adminUser ? adminUser.id : null;
    const now = new Date().toISOString();

    const knownMarketItems = [
      { key: 'usd', title: 'دلار', source_key: 'servix_market', url: 'https://servix.cc/api/v1/assets', symbol: 'USD_RLS' },
      { key: 'gold-24k', title: 'طلای ۲۴ عیار', source_key: 'servix_market', url: 'https://servix.cc/api/v1/assets', symbol: 'GOLD_24_RLS' },
      { key: 'coin-quarter', title: 'ربع سکه', source_key: 'servix_market', url: 'https://servix.cc/api/v1/assets', symbol: 'ROB_SEKKEH_RLS' },
      { key: 'coin-half', title: 'نیم سکه', source_key: 'servix_market', url: 'https://servix.cc/api/v1/assets', symbol: 'NIM_SEKKEH_RLS' },
      { key: 'coin-emami', title: 'سکه امامی', source_key: 'servix_market', url: 'https://servix.cc/api/v1/assets', symbol: 'SEKKEH_RLS' },
    ];

    for (const item of knownMarketItems) {
      const existing = db.prepare('SELECT key FROM managed_products WHERE key = ?').get(item.key);
      if (!existing) {
        const hasHistory = db.prepare('SELECT id FROM price_snapshots WHERE product_key = ? LIMIT 1').get(item.key);
        if (hasHistory) {
          db.prepare(`
            INSERT OR IGNORE INTO managed_products (key, title, user_id, is_public, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
          `).run(item.key, item.title, adminId, now, now);

          db.prepare(`
            INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
          `).run(item.key, item.source_key, item.url, JSON.stringify({ symbol: item.symbol }), now, now);

          if (adminId != null) {
            db.prepare(`
              INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at)
              VALUES (?, ?, ?, ?)
            `).run(adminId, item.key, item.title, now);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DB] user_products migration warning:', err);
  }

  seedDefaultSourcesIfEmpty(db);
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

export function seedDefaultSourcesIfEmpty(db: Database.Database): void {
  try {
    const countRow = db.prepare('SELECT count(*) as cnt FROM managed_sources').get() as { cnt: number } | undefined;
    if (countRow && countRow.cnt > 0) {
      return;
    }

    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO managed_sources (
        key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Check if we can seed from previous sources table
    const pastSources = db.prepare('SELECT DISTINCT key, adapter, config_json FROM sources').all() as any[];
    if (pastSources.length > 0) {
      const txn = db.transaction(() => {
        for (const s of pastSources) {
          let timeout = 15;
          let rateLimit = 2;
          let currency = 'IRR';
          let multiplier = 1;
          let headers = {};
          let settings = {};
          try {
            const conf = JSON.parse(s.config_json);
            if (conf.timeout_seconds) timeout = conf.timeout_seconds;
            if (conf.rate_limit_seconds) rateLimit = conf.rate_limit_seconds;
            if (conf.currency) currency = conf.currency;
            if (conf.price_multiplier) multiplier = conf.price_multiplier;
            if (conf.headers) headers = conf.headers;
            if (conf.settings) settings = conf.settings;
          } catch {}
          insert.run(
            s.key,
            s.adapter,
            timeout,
            rateLimit,
            currency,
            multiplier,
            JSON.stringify(headers),
            JSON.stringify(settings),
            now,
            now
          );
        }
      });
      txn();
      return;
    }

    // Default built-in sources
    const defaults = [
      {
        key: 'digikala_api',
        adapter: 'digikala_api',
        timeout_seconds: 20,
        rate_limit_seconds: 3,
        currency: 'IRR',
        price_multiplier: 1,
        headers: { 'User-Agent': 'price-getter/0.1 (+https://example.local)' },
        settings: {},
      },
      {
        key: 'digikala_web',
        adapter: 'digikala_web',
        timeout_seconds: 20,
        rate_limit_seconds: 3,
        currency: 'IRR',
        price_multiplier: 1,
        headers: { 'User-Agent': 'price-getter/0.1 (+https://example.local)' },
        settings: {},
      },
      {
        key: 'generic_demo',
        adapter: 'generic_html',
        timeout_seconds: 15,
        rate_limit_seconds: 2,
        currency: 'TOMAN',
        price_multiplier: 10,
        headers: {},
        settings: {
          selectors: {
            title: 'h1.product-title',
            price: '.price',
            seller: '.seller',
            availability: '.availability',
          },
        },
      },
      {
        key: 'brsapi_market',
        adapter: 'brsapi_market',
        timeout_seconds: 15,
        rate_limit_seconds: 2,
        currency: 'TOMAN',
        price_multiplier: 10,
        headers: {},
        settings: {
          api_key_env: 'brsapi_api',
          cache_ttl_seconds: 30,
        },
      },
    ];

    const txn = db.transaction(() => {
      for (const s of defaults) {
        insert.run(
          s.key,
          s.adapter,
          s.timeout_seconds,
          s.rate_limit_seconds,
          s.currency,
          s.price_multiplier,
          JSON.stringify(s.headers),
          JSON.stringify(s.settings),
          now,
          now
        );
      }
    });
    txn();
  } catch (err) {
    console.warn('[DB] seedDefaultSourcesIfEmpty warning:', err);
  }
}

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

export function isUserTrackingProduct(
  db: Database.Database,
  userId: number,
  productKey: string
): boolean {
  const row = db
    .prepare('SELECT 1 FROM user_products WHERE user_id = ? AND product_key = ? LIMIT 1')
    .get(userId, productKey);
  return Boolean(row);
}

export function findManagedTargetByUrl(
  db: Database.Database,
  rawUrl: string,
  sourceKey?: string | null,
  adapterSettings?: Record<string, any> | string
): ManagedTargetRow | undefined {
  const norm = normalizeTargetUrl(rawUrl);
  if (!norm) return undefined;

  const targetKey = getTargetDeduplicationKey(sourceKey || '', rawUrl, adapterSettings);
  const isMarket =
    (sourceKey && (sourceKey.includes('market') || sourceKey.includes('servix') || sourceKey.includes('brsapi'))) ||
    targetKey.includes('::');

  // If it's a market endpoint without an explicit symbol, we cannot safely match by URL alone
  if (isMarket && !adapterSettings && !targetKey.split('::')[2]) {
    return undefined;
  }

  const allTargets = db.prepare('SELECT * FROM managed_targets').all() as ManagedTargetRow[];
  return allTargets.find((t) => {
    const key = getTargetDeduplicationKey(t.source_key, t.url, t.adapter_settings);
    return key === targetKey;
  });
}

export function getManagedProducts(
  db: Database.Database,
  filter?: { userId?: number; isAdmin?: boolean }
): ManagedProductRow[] {
  if (filter?.isAdmin) {
    return db
      .prepare(`
        SELECT mp.*, u.username AS owner_username, 1 AS is_tracked_by_user
        FROM managed_products mp
        LEFT JOIN users u ON u.id = mp.user_id
        ORDER BY mp.key ASC
      `)
      .all() as ManagedProductRow[];
  }

  if (filter?.userId !== undefined) {
    const rows = db
      .prepare(`
        SELECT mp.key,
               COALESCE(up.custom_title, mp.title) AS title,
               mp.user_id,
               mp.is_public,
               mp.created_at,
               mp.updated_at,
               u.username AS owner_username,
               CASE WHEN up.user_id IS NOT NULL OR mp.user_id = ? THEN 1 ELSE 0 END AS is_tracked_by_user
        FROM managed_products mp
        LEFT JOIN user_products up ON up.product_key = mp.key AND up.user_id = ?
        LEFT JOIN users u ON u.id = mp.user_id
        WHERE mp.is_public = 1 OR up.user_id = ? OR mp.user_id = ?
        ORDER BY mp.key ASC
      `)
      .all(filter.userId, filter.userId, filter.userId, filter.userId) as any[];

    return rows.map((r) => ({
      ...r,
      is_tracked_by_user: Boolean(r.is_tracked_by_user),
    })) as ManagedProductRow[];
  }

  return db
    .prepare(`
      SELECT mp.*, u.username AS owner_username
      FROM managed_products mp
      LEFT JOIN users u ON u.id = mp.user_id
      ORDER BY mp.key ASC
    `)
    .all() as ManagedProductRow[];
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
  options: {
    title: string;
    url: string;
    source_key?: string | null;
    key?: string;
    user_id?: number | null;
    is_public?: boolean | number;
    adapter_settings?: Record<string, any> | string;
  }
): { product_key: string; reused?: boolean } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';
  const userId = options.user_id ?? null;
  const isPublic = options.is_public ? 1 : 0;
  const now = new Date().toISOString();

  // Deduplication check: does a target with this URL and symbol already exist?
  const existingTarget = findManagedTargetByUrl(db, cleanUrl, sourceKey, options.adapter_settings);
  if (existingTarget) {
    const existingProd = db
      .prepare('SELECT * FROM managed_products WHERE key = ?')
      .get(existingTarget.product_key) as ManagedProductRow | undefined;
    if (existingProd) {
      if (userId != null) {
        const alreadyLinked = db
          .prepare('SELECT 1 FROM user_products WHERE user_id = ? AND product_key = ?')
          .get(userId, existingTarget.product_key);
        if (!alreadyLinked) {
          const userRow = getUserById(db, userId);
          if (userRow && userRow.role !== 'admin') {
            const quota = getUserQuota(db, userId, false);
            if (!quota.canAdd) {
              throw new Error(`سقف ظرفیت محصولات شما (${quota.totalLimit} محصول) تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.`);
            }
          }
        }
        db.prepare(`
          INSERT INTO user_products (user_id, product_key, custom_title, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, product_key) DO UPDATE SET custom_title = excluded.custom_title
        `).run(userId, existingTarget.product_key, cleanTitle, now);
      }
      return { product_key: existingTarget.product_key, reused: true };
    }
  }

  // Check quota for new product creation if user is not admin
  if (userId != null) {
    const userRow = getUserById(db, userId);
    if (userRow && userRow.role !== 'admin') {
      const quota = getUserQuota(db, userId, false);
      if (!quota.canAdd) {
        throw new Error(`سقف ظرفیت محصولات شما (${quota.totalLimit} محصول) تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.`);
      }
    }
  }

  const existing = new Set(
    (db.prepare('SELECT key FROM managed_products').all() as Array<{ key: string }>).map((r) => r.key)
  );

  let productKey = options.key?.trim();
  if (!productKey) {
    productKey = makeProductKey(cleanTitle, existing);
  } else if (existing.has(productKey)) {
    throw new Error(`product key already exists: ${productKey}`);
  }

  let adapterSettingsStr = '{}';
  if (options.adapter_settings) {
    adapterSettingsStr =
      typeof options.adapter_settings === 'string'
        ? options.adapter_settings
        : JSON.stringify(options.adapter_settings);
  }

  const insertProd = db.prepare(
    'INSERT INTO managed_products (key, title, user_id, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertTgt = db.prepare(
    'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
  );
  const insertUserProd = db.prepare(
    'INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at) VALUES (?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    insertProd.run(productKey, cleanTitle, userId, isPublic, now, now);
    insertTgt.run(productKey, sourceKey, cleanUrl, adapterSettingsStr, now, now);
    if (userId != null) {
      insertUserProd.run(userId, productKey, cleanTitle, now);
    }
  });
  txn();

  return { product_key: productKey, reused: false };
}


export function updateManagedProduct(
  db: Database.Database,
  productKey: string,
  options: {
    title: string;
    url: string;
    source_key?: string | null;
    is_public?: boolean | number;
  },
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';

  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: محصولات عمومی بازار فقط توسط مدیر قابل ویرایش هستند.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان ویرایش محصولات خود را دارید.');
    }
  }

  const now = new Date().toISOString();
  const nextIsPublic =
    requestingUser?.role === 'admin' && options.is_public !== undefined
      ? options.is_public
        ? 1
        : 0
      : prod.is_public ?? 0;

  const existingTarget = db
    .prepare('SELECT * FROM managed_targets WHERE product_key = ? LIMIT 1')
    .get(productKey) as ManagedTargetRow | undefined;

  const isUrlChanging = existingTarget ? normalizeTargetUrl(existingTarget.url) !== normalizeTargetUrl(cleanUrl) : true;
  const trackersCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM user_products WHERE product_key = ?').get(productKey) as { cnt: number }
  )?.cnt ?? 0;

  // If non-admin changes URL and product is tracked by multiple users, fork for this user
  if (requestingUser && requestingUser.role !== 'admin' && isUrlChanging && trackersCount > 1) {
    db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(requestingUser.id, productKey);
    return addManagedProduct(db, {
      title: cleanTitle,
      url: cleanUrl,
      source_key: sourceKey,
      user_id: requestingUser.id,
      is_public: false,
    });
  }

  const txn = db.transaction(() => {
    db.prepare('UPDATE managed_products SET title = ?, is_public = ?, updated_at = ? WHERE key = ?').run(
      cleanTitle,
      nextIsPublic,
      now,
      productKey
    );
    if (requestingUser && isTracker) {
      db.prepare('UPDATE user_products SET custom_title = ? WHERE user_id = ? AND product_key = ?').run(
        cleanTitle,
        requestingUser.id,
        productKey
      );
    }
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

export function deleteManagedProduct(
  db: Database.Database,
  productKey: string,
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: محصولات عمومی بازار فقط توسط مدیر قابل حذف هستند.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان حذف محصولات خود را دارید.');
    }
  }

  const txn = db.transaction(() => {
    if (requestingUser && requestingUser.role !== 'admin') {
      db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(requestingUser.id, productKey);

      const remaining = db
        .prepare('SELECT COUNT(*) as cnt FROM user_products WHERE product_key = ?')
        .get(productKey) as { cnt: number };

      if (remaining.cnt > 0) {
        if (prod.user_id === requestingUser.id) {
          const nextUser = db
            .prepare('SELECT user_id FROM user_products WHERE product_key = ? ORDER BY id ASC LIMIT 1')
            .get(productKey) as { user_id: number } | undefined;
          if (nextUser) {
            db.prepare('UPDATE managed_products SET user_id = ? WHERE key = ?').run(nextUser.user_id, productKey);
          }
        }
        return;
      }
    }

    db.prepare('DELETE FROM user_products WHERE product_key = ?').run(productKey);
    db.prepare('DELETE FROM managed_targets WHERE product_key = ?').run(productKey);
    db.prepare('DELETE FROM managed_products WHERE key = ?').run(productKey);
  });
  txn();

  return { product_key: productKey };
}

export function setManagedProductEnabled(
  db: Database.Database,
  productKey: string,
  enabled: boolean,
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: وضعیت محصولات عمومی بازار فقط توسط مدیر قابل تغییر است.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان تغییر وضعیت محصولات خود را دارید.');
    }
  }

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
  config?: AppConfig | null,
  targets?: TargetConfig[],
  products?: Record<string, ProductConfig>,
  triggerSource: string = 'manual',
  triggerDetails?: Record<string, any> | string | null
): number {
  let effectiveSources = config?.sources;
  if (!effectiveSources || Object.keys(effectiveSources).length === 0) {
    effectiveSources = getSourcesMap(db);
  }

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
      effectiveTargets = config?.targets || [];
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
      effectiveProducts = config?.products || {};
    }
  }

  const activeTargetsCount = effectiveTargets.filter((t) => t.enabled).length;
  const startedAt = new Date().toISOString();

  let detailsStr: string | null = null;
  if (triggerDetails) {
    detailsStr = typeof triggerDetails === 'string' ? triggerDetails : JSON.stringify(triggerDetails);
  }

  const insertRun = db.prepare(`
    INSERT INTO runs (started_at, status, config_path, target_count, success_count, error_count, trigger_source, trigger_details)
    VALUES (?, 'running', ?, ?, 0, 0, ?, ?)
  `);
  const result = insertRun.run(startedAt, configPath, activeTargetsCount, triggerSource || 'manual', detailsStr);
  const runId = Number(result.lastInsertRowid);

  const insertSource = db.prepare(`
    INSERT INTO sources (run_id, key, adapter, config_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, source] of Object.entries(effectiveSources)) {
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

export function isMarketSource(sourceKey?: string, adapter?: string): boolean {
  if (adapter === 'brsapi_market' || adapter === 'servix_market') return true;
  if (!sourceKey) return false;
  const lower = sourceKey.toLowerCase();
  return lower.includes('market') || lower.includes('servix') || lower.includes('brsapi');
}

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Tehran';
}

export function getTimezoneHour(date: Date = new Date(), timeZone: string = getAppTimezone()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function getHourBounds(
  date: Date = new Date(),
  timeZone: string = getAppTimezone()
): { startOfHour: string; endOfHour: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }

    const minute = p.minute ?? date.getMinutes();
    const second = p.second ?? date.getSeconds();
    const ms = date.getMilliseconds();
    const msIntoHour = (minute * 60 + second) * 1000 + ms;
    const startOfHour = new Date(date.getTime() - msIntoHour);
    const endOfHour = new Date(startOfHour.getTime() + 60 * 60 * 1000 - 1);

    return {
      hour: p.hour ?? date.getHours(),
      startOfHour: startOfHour.toISOString(),
      endOfHour: endOfHour.toISOString(),
    };
  } catch {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 59, 59, 999);
    return {
      hour: date.getHours(),
      startOfHour: start.toISOString(),
      endOfHour: end.toISOString(),
    };
  }
}

export function getDayBounds(
  date: Date = new Date(),
  timeZone: string = getAppTimezone()
): { startOfDay: string; endOfDay: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }

    const hour = p.hour ?? date.getHours();
    const minute = p.minute ?? date.getMinutes();
    const second = p.second ?? date.getSeconds();
    const ms = date.getMilliseconds();
    const msIntoDay = ((hour * 60 + minute) * 60 + second) * 1000 + ms;
    const startOfDay = new Date(date.getTime() - msIntoDay);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    return {
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
    };
  } catch {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();
    return { startOfDay, endOfDay };
  }
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
    return {
      targets: allActiveTargets,
      batchSize: allActiveTargets.length,
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

  // 1. Hourly check for public targets: active between 08:00 and 23:00 in configured timezone
  const currentHour = getTimezoneHour(now);
  const isPublicCollectionHour = currentHour >= 8 && currentHour <= 23;

  let eligiblePublic: TargetConfig[] = [];
  if (isPublicCollectionHour) {
    eligiblePublic = publicTargets.filter(
      (t) => !hasSuccessfulPriceThisHour(db, t.product_key, now, t.url, t.source_key)
    );
  }

  // 2. Daily check for private targets: collected once a day across 24h
  const eligiblePrivate = privateTargets.filter(
    (t) => !hasSuccessfulPriceToday(db, t.product_key, now, t.url, t.source_key)
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
      WHERE (product_key = ? OR (url = ? AND source_key NOT LIKE '%market%' AND source_key NOT LIKE '%servix%' AND source_key NOT LIKE '%brsapi%'))
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
      WHERE (product_key = ? OR (url = ? AND source_key NOT LIKE '%market%' AND source_key NOT LIKE '%servix%' AND source_key NOT LIKE '%brsapi%'))
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

export function latestSnapshots(
  db: Database.Database,
  limit = 100,
  allowedProductKeys?: string[] | Set<string>
): PriceSnapshotRow[] {
  const allowedSet = allowedProductKeys
    ? (allowedProductKeys instanceof Set ? allowedProductKeys : new Set(allowedProductKeys))
    : null;

  // Return latest snapshot for each (product_key, source_key)
  const rows = db.prepare(`
    SELECT * FROM price_snapshots
    ORDER BY observed_at DESC, id DESC
  `).all() as PriceSnapshotRow[];

  const seen = new Set<string>();
  const latest: PriceSnapshotRow[] = [];
  for (const row of rows) {
    if (allowedSet && !allowedSet.has(row.product_key)) {
      continue;
    }
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

export function recentRuns(db: Database.Database, limit = 20): RunRow[] {
  return db.prepare(`
    SELECT * FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `).all(limit) as RunRow[];
}

export function getCronRuns(
  db: Database.Database,
  limit = 50,
  filterSource?: string,
  filterStatus?: string
): RunRow[] {
  let query = 'SELECT * FROM runs WHERE 1=1';
  const params: any[] = [];

  if (filterSource && filterSource !== 'all') {
    if (filterSource === 'automated') {
      query += " AND (trigger_source IN ('cron', 'api') OR trigger_source IS NULL)";
    } else {
      query += ' AND trigger_source = ?';
      params.push(filterSource);
    }
  }

  if (filterStatus && filterStatus !== 'all') {
    query += ' AND status = ?';
    params.push(filterStatus);
  }

  query += ' ORDER BY started_at DESC, id DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params) as RunRow[];
}

export function getCronRunStats(db: Database.Database): {
  last_run: RunRow | null;
  total_runs_24h: number;
  success_runs_24h: number;
  error_runs_24h: number;
  success_rate_24h: number;
  is_active_running: boolean;
  active_run_id: number | null;
  cron_configured: boolean;
} {
  const lastRunCron = (db.prepare(`
    SELECT * FROM runs
    WHERE trigger_source IN ('cron', 'api')
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get() as RunRow | undefined) || null;

  const lastRunAny = lastRunCron || latestRun(db);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const stats24h = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_runs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_runs,
      SUM(target_count) as total_targets,
      SUM(success_count) as total_success_targets
    FROM runs
    WHERE started_at >= ?
  `).get(twentyFourHoursAgo) as {
    total_runs: number;
    success_runs: number;
    error_runs: number;
    total_targets: number;
    total_success_targets: number;
  } | undefined;

  const totalRuns24h = stats24h?.total_runs || 0;
  const successRuns24h = stats24h?.success_runs || 0;
  const errorRuns24h = stats24h?.error_runs || 0;
  const totalTargets = stats24h?.total_targets || 0;
  const totalSuccessTargets = stats24h?.total_success_targets || 0;

  const successRate = totalTargets > 0
    ? Math.round((totalSuccessTargets / totalTargets) * 100)
    : totalRuns24h > 0
    ? Math.round((successRuns24h / totalRuns24h) * 100)
    : 100;

  const cronConfigured = Boolean(
    (process.env.TRIGGER_API_KEY && process.env.TRIGGER_API_KEY.trim().length > 0) ||
    (process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length > 0)
  );

  return {
    last_run: lastRunAny,
    total_runs_24h: totalRuns24h,
    success_runs_24h: successRuns24h,
    error_runs_24h: errorRuns24h,
    success_rate_24h: successRate,
    is_active_running: false,
    active_run_id: null,
    cron_configured: cronConfigured,
  };
}

export function getRunDetails(db: Database.Database, runId: number) {
  const run = (db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined) || null;
  if (!run) return null;

  const snapshots = db.prepare(`
    SELECT id, product_key, source_key, url, title, seller, price_irr, availability, observed_at
    FROM price_snapshots
    WHERE run_id = ?
    ORDER BY id DESC
  `).all(runId);

  const errors = db.prepare(`
    SELECT id, run_id, product_key, source_key, url, error_type, message, observed_at
    FROM fetch_errors
    WHERE run_id = ?
    ORDER BY id DESC
  `).all(runId) as FetchErrorRow[];

  return {
    run,
    snapshots,
    errors,
  };
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
  if (!row) return null;
  return {
    ...row,
    mobile: row.mobile ?? null,
    wallet_balance: row.wallet_balance ?? 0,
    extra_slots: row.extra_slots ?? 0,
  };
}

export function getUserById(db: Database.Database, id: number): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) return null;
  return {
    ...row,
    mobile: row.mobile ?? null,
    wallet_balance: row.wallet_balance ?? 0,
    extra_slots: row.extra_slots ?? 0,
  };
}

export function listUsers(db: Database.Database): SafeUser[] {
  const rows = db.prepare(`
    SELECT 
      u.id, u.username, u.email, u.mobile, u.role, u.must_change_password, u.wallet_balance, u.extra_slots, u.created_at, u.updated_at,
      COALESCE((SELECT COUNT(*) FROM user_products up WHERE up.user_id = u.id), 0) AS used_slots
    FROM users u
    ORDER BY u.id ASC
  `).all() as (Omit<SafeUser, 'must_change_password'> & { must_change_password: number; used_slots: number })[];
  return rows.map((r) => {
    const extraSlots = r.extra_slots ?? 0;
    const isAdmin = r.role === 'admin';
    return {
      ...r,
      mobile: r.mobile ?? null,
      wallet_balance: r.wallet_balance ?? 0,
      extra_slots: extraSlots,
      used_slots: Number(r.used_slots ?? 0),
      total_slots: isAdmin ? 999999 : FREE_PRODUCT_LIMIT + extraSlots,
      must_change_password: Boolean(r.must_change_password),
    };
  });
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
  params: {
    username: string;
    password_hash: string;
    email?: string | null;
    mobile?: string | null;
    role?: UserRole;
    must_change_password?: boolean;
    wallet_balance?: number;
    extra_slots?: number;
  }
): SafeUser {
  const now = new Date().toISOString();
  const role = params.role || 'viewer';
  const email = params.email || null;
  const mobile = params.mobile || null;
  const username = params.username.trim();
  const mustChange = params.must_change_password ? 1 : 0;
  const walletBalance = params.wallet_balance ?? 0;
  const extraSlots = params.extra_slots ?? 0;

  const stmt = db.prepare(`
    INSERT INTO users (username, email, mobile, password_hash, role, must_change_password, wallet_balance, extra_slots, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(username, email, mobile, params.password_hash, role, mustChange, walletBalance, extraSlots, now, now);
  const id = Number(result.lastInsertRowid);

  return {
    id,
    username,
    email,
    mobile,
    role,
    must_change_password: Boolean(mustChange),
    wallet_balance: walletBalance,
    extra_slots: extraSlots,
    created_at: now,
    updated_at: now,
  };
}

export function updateUser(
  db: Database.Database,
  id: number,
  params: { password_hash?: string; role?: UserRole; email?: string | null; mobile?: string | null; must_change_password?: boolean }
): SafeUser {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  const now = new Date().toISOString();
  const nextPasswordHash = params.password_hash !== undefined ? params.password_hash : existing.password_hash;
  const nextRole = params.role !== undefined ? params.role : existing.role;
  const nextEmail = params.email !== undefined ? params.email : existing.email;
  const nextMobile = params.mobile !== undefined ? params.mobile : (existing.mobile ?? null);
  const nextMustChange = params.must_change_password !== undefined
    ? (params.must_change_password ? 1 : 0)
    : (existing.must_change_password ?? 0);

  if (existing.role === 'admin' && nextRole !== 'admin') {
    const adminCount = countAdmins(db);
    if (adminCount <= 1) {
      throw new Error('امکان تغییر نقش آخرین مدیر سیستم وجود ندارد.');
    }
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = ?, email = ?, mobile = ?, must_change_password = ?, updated_at = ?
    WHERE id = ?
  `).run(nextPasswordHash, nextRole, nextEmail, nextMobile, nextMustChange, now, id);

  return {
    id,
    username: existing.username,
    email: nextEmail,
    mobile: nextMobile,
    role: nextRole,
    must_change_password: Boolean(nextMustChange),
    wallet_balance: existing.wallet_balance,
    extra_slots: existing.extra_slots,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function updateUserProfile(
  db: Database.Database,
  id: number,
  params: { email?: string | null; mobile?: string | null }
): SafeUser {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  const now = new Date().toISOString();
  const nextEmail = params.email !== undefined ? (params.email?.trim() || null) : existing.email;
  const nextMobile = params.mobile !== undefined ? (params.mobile?.trim() || null) : (existing.mobile ?? null);

  db.prepare(`
    UPDATE users
    SET email = ?, mobile = ?, updated_at = ?
    WHERE id = ?
  `).run(nextEmail, nextMobile, now, id);

  return {
    id,
    username: existing.username,
    email: nextEmail,
    mobile: nextMobile,
    role: existing.role,
    must_change_password: Boolean(existing.must_change_password),
    wallet_balance: existing.wallet_balance,
    extra_slots: existing.extra_slots,
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

export function getUserQuota(db: Database.Database, userId: number, isAdmin = false): UserQuota {
  const usedCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM user_products WHERE user_id = ?').get(userId) as { cnt: number }
  )?.cnt ?? 0;

  if (isAdmin) {
    return {
      freeLimit: FREE_PRODUCT_LIMIT,
      extraSlots: 999999,
      totalLimit: 999999,
      usedCount,
      remaining: 999999,
      canAdd: true,
    };
  }

  const user = getUserById(db, userId);
  const extraSlots = user?.extra_slots ?? 0;
  const totalLimit = FREE_PRODUCT_LIMIT + extraSlots;
  const remaining = Math.max(0, totalLimit - usedCount);

  return {
    freeLimit: FREE_PRODUCT_LIMIT,
    extraSlots,
    totalLimit,
    usedCount,
    remaining,
    canAdd: usedCount < totalLimit,
  };
}

export function chargeUserWallet(
  db: Database.Database,
  params: {
    userId: number;
    amount: number;
    description?: string;
    type?: 'admin_charge' | 'admin_adjustment';
  }
): { balance: number; transaction: WalletTransactionRow } {
  const { userId, amount, description, type = 'admin_charge' } = params;
  if (!amount || isNaN(amount)) {
    throw new Error('مبلغ شارژ نامعتبر است.');
  }

  const txn = db.transaction(() => {
    const user = getUserById(db, userId);
    if (!user) {
      throw new Error(`کاربر با شناسه ${userId} یافت نشد.`);
    }

    const currentBalance = user.wallet_balance || 0;
    const newBalance = currentBalance + amount;
    if (newBalance < 0) {
      throw new Error('موجودی کیف پول نمی‌تواند منفی شود.');
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET wallet_balance = ?, updated_at = ? WHERE id = ?').run(newBalance, now, userId);

    const desc = description || (amount >= 0 ? `شارژ کیف پول توسط مدیر سیستم` : `کسر از کیف پول توسط مدیر سیستم`);
    const insertTxn = db.prepare(`
      INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = insertTxn.run(userId, amount, newBalance, type, desc, now);

    return {
      balance: newBalance,
      transaction: {
        id: Number(res.lastInsertRowid),
        user_id: userId,
        amount,
        balance_after: newBalance,
        type,
        description: desc,
        created_at: now,
      },
    };
  });

  return txn();
}

export function purchaseProductSlot(
  db: Database.Database,
  params: {
    userId: number;
    slotPrice?: number;
  }
): { extra_slots: number; wallet_balance: number; transaction: WalletTransactionRow; quota: UserQuota } {
  const price = params.slotPrice ?? getSlotPriceToman();
  if (price <= 0) {
    throw new Error('قیمت اسلات نامعتبر است.');
  }

  const txn = db.transaction(() => {
    const user = getUserById(db, params.userId);
    if (!user) {
      throw new Error(`کاربر یافت نشد.`);
    }

    const currentBalance = user.wallet_balance || 0;
    if (currentBalance < price) {
      throw new Error(
        `موجودی کیف پول شما (${currentBalance.toLocaleString('fa-IR')} تومان) برای خرید اسلات (${price.toLocaleString('fa-IR')} تومان) کافی نیست.`
      );
    }

    const newBalance = currentBalance - price;
    const newSlots = (user.extra_slots || 0) + 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users
      SET wallet_balance = ?, extra_slots = ?, updated_at = ?
      WHERE id = ?
    `).run(newBalance, newSlots, now, params.userId);

    const desc = `خرید ۱ اسلات ظرفیت پایش محصول`;
    const insertTxn = db.prepare(`
      INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description, created_at)
      VALUES (?, ?, ?, 'slot_purchase', ?, ?)
    `);
    const res = insertTxn.run(params.userId, -price, newBalance, desc, now);

    const transaction: WalletTransactionRow = {
      id: Number(res.lastInsertRowid),
      user_id: params.userId,
      amount: -price,
      balance_after: newBalance,
      type: 'slot_purchase',
      description: desc,
      created_at: now,
    };

    const quota = getUserQuota(db, params.userId, user.role === 'admin');

    return {
      extra_slots: newSlots,
      wallet_balance: newBalance,
      transaction,
      quota,
    };
  });

  return txn();
}

export function getUserWalletTransactions(
  db: Database.Database,
  userId: number,
  limit = 20
): WalletTransactionRow[] {
  return db
    .prepare(`
      SELECT id, user_id, amount, balance_after, type, description, created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(userId, limit) as WalletTransactionRow[];
}

export function getActivePackages(db: Database.Database): PackageRow[] {
  return db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY slots ASC').all() as PackageRow[];
}

export function getPackageById(db: Database.Database, id: number): PackageRow | null {
  const row = db.prepare('SELECT * FROM packages WHERE id = ?').get(id) as PackageRow | undefined;
  return row ?? null;
}

export function getPackageByKey(db: Database.Database, key: string): PackageRow | null {
  const row = db.prepare('SELECT * FROM packages WHERE key = ?').get(key) as PackageRow | undefined;
  return row ?? null;
}

export function createPaymentTransaction(
  db: Database.Database,
  params: {
    user_id: number;
    package_id: number | null;
    package_title: string;
    slots: number;
    amount_toman: number;
    gateway: string;
    authority?: string | null;
    meta?: any;
  }
): PaymentTransactionRow {
  const now = new Date().toISOString();
  const metaStr = params.meta ? (typeof params.meta === 'string' ? params.meta : JSON.stringify(params.meta)) : '{}';
  const stmt = db.prepare(`
    INSERT INTO payment_transactions (user_id, package_id, package_title, slots, amount_toman, gateway, authority, status, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const result = stmt.run(
    params.user_id,
    params.package_id,
    params.package_title,
    params.slots,
    params.amount_toman,
    params.gateway,
    params.authority || null,
    metaStr,
    now,
    now
  );
  const id = Number(result.lastInsertRowid);
  return getPaymentTransactionById(db, id)!;
}

export function updatePaymentTransactionAuthority(
  db: Database.Database,
  id: number,
  authority: string,
  meta?: any
): void {
  const now = new Date().toISOString();
  if (meta) {
    const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
    db.prepare('UPDATE payment_transactions SET authority = ?, meta = ?, updated_at = ? WHERE id = ?').run(authority, metaStr, now, id);
  } else {
    db.prepare('UPDATE payment_transactions SET authority = ?, updated_at = ? WHERE id = ?').run(authority, now, id);
  }
}

export function getPaymentTransactionById(db: Database.Database, id: number): PaymentTransactionRow | null {
  const row = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
  return row ?? null;
}

export function getPaymentTransactionByAuthority(db: Database.Database, authority: string): PaymentTransactionRow | null {
  const row = db.prepare('SELECT * FROM payment_transactions WHERE authority = ?').get(authority) as PaymentTransactionRow | undefined;
  return row ?? null;
}

export function markPaymentTransactionPaid(
  db: Database.Database,
  id: number,
  refId: string,
  meta?: any
): { success: boolean; alreadyPaid: boolean; extraSlots: number } {
  const txn = db.transaction(() => {
    const current = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
    if (!current) {
      throw new Error(`تراکنش با شناسه ${id} یافت نشد.`);
    }

    const user = getUserById(db, current.user_id);
    if (!user) {
      throw new Error(`کاربر صاحب تراکنش با شناسه ${current.user_id} یافت نشد.`);
    }

    // Idempotency: if already marked paid, return safely without granting slots again
    if (current.status === 'paid') {
      return { success: true, alreadyPaid: true, extraSlots: user.extra_slots };
    }

    const now = new Date().toISOString();
    let nextMeta = current.meta || '{}';
    if (meta) {
      try {
        const parsedCurrent = JSON.parse(current.meta || '{}');
        const parsedNew = typeof meta === 'string' ? JSON.parse(meta) : meta;
        nextMeta = JSON.stringify({ ...parsedCurrent, ...parsedNew });
      } catch {
        nextMeta = typeof meta === 'string' ? meta : JSON.stringify(meta);
      }
    }

    db.prepare(`
      UPDATE payment_transactions
      SET status = 'paid', ref_id = ?, paid_at = ?, meta = ?, updated_at = ?
      WHERE id = ?
    `).run(refId, now, nextMeta, now, id);

    const newExtraSlots = (user.extra_slots || 0) + current.slots;
    db.prepare('UPDATE users SET extra_slots = ?, updated_at = ? WHERE id = ?').run(newExtraSlots, now, user.id);

    return { success: true, alreadyPaid: false, extraSlots: newExtraSlots };
  });

  return txn();
}

export function markPaymentTransactionFailed(
  db: Database.Database,
  id: number,
  meta?: any
): void {
  const current = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
  if (!current) return;
  if (current.status === 'paid') return; // Do not fail an already paid transaction

  const now = new Date().toISOString();
  let nextMeta = current.meta || '{}';
  if (meta) {
    try {
      const parsedCurrent = JSON.parse(current.meta || '{}');
      const parsedNew = typeof meta === 'string' ? JSON.parse(meta) : meta;
      nextMeta = JSON.stringify({ ...parsedCurrent, ...parsedNew });
    } catch {
      nextMeta = typeof meta === 'string' ? meta : JSON.stringify(meta);
    }
  }

  db.prepare(`
    UPDATE payment_transactions
    SET status = 'failed', meta = ?, updated_at = ?
    WHERE id = ?
  `).run(nextMeta, now, id);
}

export function getUserPaymentTransactions(
  db: Database.Database,
  userId: number,
  limit = 50
): PaymentTransactionRow[] {
  return db.prepare(`
    SELECT * FROM payment_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, limit) as PaymentTransactionRow[];
}



