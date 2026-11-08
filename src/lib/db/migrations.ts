import Database from 'better-sqlite3';
import { ManagedTargetRow } from '../types';
import { getTargetDeduplicationKey } from '../urls';

export function runMigrations(db: Database.Database): void {
  // 1. Runs table columns
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

  // 2. Users table columns
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

  // 3. Packages table columns and subscriptions backfill
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

  // 4. Managed products columns, hours and public defaults
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

      // Ensure market products (usd, gold, coin) and default public market products have 24-hour collection (00:00 - 23:00)
      db.prepare(`
        UPDATE managed_products
        SET active_start_hour = 0, active_end_hour = 23
        WHERE key IN ('usd', 'gold', 'coin', 'sekkeh', 'tala', 'gold-18k', 'gold-24k', 'coin-quarter', 'coin-half', 'coin-emami')
           OR (is_public = 1 AND active_start_hour = 8 AND active_end_hour = 23)
      `).run();

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

  // 5. User products column migrations
  try {
    const userProdCols = db.prepare('PRAGMA table_info(user_products)').all() as { name: string }[];
    if (userProdCols.length > 0 && !userProdCols.some((col) => col.name === 'last_manual_refresh_at')) {
      db.prepare('ALTER TABLE user_products ADD COLUMN last_manual_refresh_at DATETIME DEFAULT NULL').run();
    }
  } catch (err) {
    console.warn('[DB] user_products column migration warning:', err);
  }

  // 6. Deduplication and backfills
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
}
