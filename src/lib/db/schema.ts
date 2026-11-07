import Database from 'better-sqlite3';
import { AppConfig, ManagedTargetRow } from '../types';
import { getTargetDeduplicationKey } from '../urls';
import { latestRun } from './runs';

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
      show_usd_chart INTEGER NOT NULL DEFAULT 0,
      active_start_hour INTEGER NOT NULL DEFAULT 8,
      active_end_hour INTEGER NOT NULL DEFAULT 23,
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
      slot_expires_at DATETIME DEFAULT NULL,
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
      duration_days INTEGER NOT NULL DEFAULT 30,
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

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slots INTEGER NOT NULL,
      price_toman INTEGER NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      source_type VARCHAR(32) NOT NULL,
      package_id INTEGER REFERENCES packages(id),
      package_key VARCHAR(64),
      package_title VARCHAR(128),
      payment_transaction_id INTEGER REFERENCES payment_transactions(id),
      starts_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_user_id ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_status ON user_subscriptions(status);
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_expires_at ON user_subscriptions(expires_at);
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
      if (!userColumns.some((col) => col.name === 'slot_expires_at')) {
        db.prepare('ALTER TABLE users ADD COLUMN slot_expires_at DATETIME DEFAULT NULL').run();
      }
    }
  } catch {
    // Migration skipped if already present or table not yet accessible
  }

  try {
    const pkgColumns = db.prepare('PRAGMA table_info(packages)').all() as { name: string }[];
    if (pkgColumns.length > 0 && !pkgColumns.some((col) => col.name === 'duration_days')) {
      db.prepare('ALTER TABLE packages ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 30').run();
    }

    const pkgCount = (db.prepare('SELECT count(*) as count FROM packages').get() as { count: number })?.count ?? 0;
    if (pkgCount === 0) {
      const now = new Date().toISOString();
      const insertPkg = db.prepare(`
        INSERT INTO packages (key, title, slots, price_toman, duration_days, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 30, ?, 1, ?, ?)
      `);
      insertPkg.run('pkg_5', 'بسته ۵ تایی محصول (ماهانه)', 5, 75000, 'امکان پایش ۵ محصول جدید اضافه به مدت ۳۰ روز', now, now);
      insertPkg.run('pkg_10', 'بسته ۱۰ تایی محصول (ماهانه)', 10, 140000, 'امکان پایش ۱۰ محصول جدید اضافه به مدت ۳۰ روز (تخفیف ویژه)', now, now);
      insertPkg.run('pkg_25', 'بسته ۲۵ تایی محصول (ماهانه)', 25, 300000, 'امکان پایش ۲۵ محصول جدید اضافه برای کاربران حرفه‌ای (۳۰ روزه)', now, now);
    } else {
      // Update existing packages descriptions if they mention "دائمی"
      db.prepare(`
        UPDATE packages
        SET description = REPLACE(description, 'به صورت دائمی', 'به مدت ۳۰ روز (ماهانه)'),
            title = CASE 
              WHEN title NOT LIKE '%ماهانه%' THEN title || ' (ماهانه)'
              ELSE title 
            END
        WHERE description LIKE '%به صورت دائمی%' OR title NOT LIKE '%ماهانه%'
      `).run();
    }

    // Migrate existing users who have extra_slots > 0 but null slot_expires_at
    const usersNeedingExpiry = db
      .prepare('SELECT id, extra_slots FROM users WHERE extra_slots > 0 AND slot_expires_at IS NULL')
      .all() as Array<{ id: number; extra_slots: number }>;
    if (usersNeedingExpiry.length > 0) {
      const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();
      for (const u of usersNeedingExpiry) {
        db.prepare('UPDATE users SET slot_expires_at = ? WHERE id = ?').run(futureExpiry, u.id);
        db.prepare(`
          INSERT INTO user_subscriptions (
            user_id, slots, price_toman, duration_days, source_type,
            package_title, starts_at, expires_at, status, created_at
          ) VALUES (?, ?, 0, 30, 'admin', 'اشتراک اولیه (مهاجرت ۳۰ روزه)', ?, ?, 'active', ?)
        `).run(u.id, u.extra_slots, nowIso, futureExpiry, nowIso);
      }
    }
  } catch (err) {
    console.warn('[DB] packages seed/migration warning:', err);
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
      if (!prodColumns.some((col) => col.name === 'show_usd_chart')) {
        db.prepare('ALTER TABLE managed_products ADD COLUMN show_usd_chart INTEGER NOT NULL DEFAULT 0').run();
      }
      if (!prodColumns.some((col) => col.name === 'active_start_hour')) {
        db.prepare('ALTER TABLE managed_products ADD COLUMN active_start_hour INTEGER NOT NULL DEFAULT 8').run();
      }
      if (!prodColumns.some((col) => col.name === 'active_end_hour')) {
        db.prepare('ALTER TABLE managed_products ADD COLUMN active_end_hour INTEGER NOT NULL DEFAULT 23').run();
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
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO managed_sources (
        key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const countRow = db.prepare('SELECT count(*) as cnt FROM managed_sources').get() as { cnt: number } | undefined;
    const isBrandNew = !countRow || countRow.cnt === 0;

    // Check if we can seed from previous sources table if brand new
    if (isBrandNew) {
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
      }
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
      {
        key: 'iranjib',
        adapter: 'iranjib',
        timeout_seconds: 15,
        rate_limit_seconds: 2,
        currency: 'TOMAN',
        price_multiplier: 10,
        headers: {},
        settings: {
          cache_ttl_seconds: 60,
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
