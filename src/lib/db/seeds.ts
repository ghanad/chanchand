import Database from 'better-sqlite3';
import { AppConfig } from '../types';
import { latestRun } from './runs';

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
