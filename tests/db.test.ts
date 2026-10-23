import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  initDatabase,
  startRun,
  recordPrice,
  recordError,
  finishRun,
  latestSnapshots,
  hasSuccessfulPriceToday,
  addManagedProduct,
  getManagedProducts,
  getManagedTargets,
  updateManagedProduct,
  deleteManagedProduct,
  setManagedProductEnabled,
  addManagedSource,
  getManagedSources,
  getSourcesMap,
  updateManagedSource,
  deleteManagedSource,
} from '../src/lib/db';
import { AppConfig } from '../src/lib/types';

describe('db module', () => {
  it('creates tables and manages runs and prices', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const config: AppConfig = {
      sources: {
        test_source: {
          adapter: 'generic_html',
          timeout_seconds: 10,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {
        item_1: { title: 'Item One' },
      },
      targets: [
        {
          product_key: 'item_1',
          source_key: 'test_source',
          url: 'https://example.com/item',
          enabled: true,
        },
      ],
    };

    const runId = startRun(db, null, config);
    expect(runId).toBeGreaterThan(0);

    const priceId = recordPrice(db, runId, config.targets[0], {
      title: 'Item One',
      seller: 'Test Seller',
      price_irr: 500000,
      availability: 'in_stock',
      raw_observation: { test: true },
    });
    expect(priceId).toBeGreaterThan(0);

    expect(hasSuccessfulPriceToday(db, 'item_1')).toBe(true);
    expect(hasSuccessfulPriceToday(db, 'unknown_item')).toBe(false);

    finishRun(db, runId, 1, 0, 1);

    const snapshots = latestSnapshots(db);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].product_key).toBe('item_1');
    expect(snapshots[0].price_irr).toBe(500000);

    db.close();
  });

  it('manages products and targets in SQLite', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const added = addManagedProduct(db, {
      title: 'گوشی موبایل',
      url: 'https://www.digikala.com/product/dkp-12345',
      source_key: 'digikala_api',
    });
    expect(added.product_key).toBeDefined();

    const prods = getManagedProducts(db);
    expect(prods.length).toBe(1);
    expect(prods[0].key).toBe(added.product_key);
    expect(prods[0].title).toBe('گوشی موبایل');

    const targets = getManagedTargets(db);
    expect(targets.length).toBe(1);
    expect(targets[0].product_key).toBe(added.product_key);
    expect(targets[0].enabled).toBe(1);

    // Disable target
    setManagedProductEnabled(db, added.product_key, false);
    const disabledTargets = getManagedTargets(db, added.product_key);
    expect(disabledTargets[0].enabled).toBe(0);

    // Enable target
    setManagedProductEnabled(db, added.product_key, true);
    const enabledTargets = getManagedTargets(db, added.product_key);
    expect(enabledTargets[0].enabled).toBe(1);

    // Update
    updateManagedProduct(db, added.product_key, {
      title: 'گوشی موبایل آپدیت‌شده',
      url: 'https://www.digikala.com/product/dkp-99999',
      source_key: 'digikala_web',
    });
    const updatedProds = getManagedProducts(db);
    expect(updatedProds[0].title).toBe('گوشی موبایل آپدیت‌شده');
    const updatedTargets = getManagedTargets(db, added.product_key);
    expect(updatedTargets[0].source_key).toBe('digikala_web');

    // Delete
    deleteManagedProduct(db, added.product_key);
    expect(getManagedProducts(db).length).toBe(0);
    expect(getManagedTargets(db).length).toBe(0);

    db.close();
  });

  it('manages sources in SQLite', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    // Initial default sources seeded
    const initialSources = getManagedSources(db);
    expect(initialSources.length).toBeGreaterThan(0);
    expect(initialSources.some((s) => s.key === 'digikala_api')).toBe(true);

    // Add source
    const added = addManagedSource(db, {
      key: 'custom_source',
      adapter: 'generic_html',
      rate_limit_seconds: 5,
      currency: 'TOMAN',
      price_multiplier: 10,
    });
    expect(added.source_key).toBe('custom_source');

    const sourcesMap = getSourcesMap(db);
    expect(sourcesMap['custom_source']).toBeDefined();
    expect(sourcesMap['custom_source'].rate_limit_seconds).toBe(5);

    // Update source
    updateManagedSource(db, 'custom_source', {
      rate_limit_seconds: 1,
    });
    const updatedMap = getSourcesMap(db);
    expect(updatedMap['custom_source'].rate_limit_seconds).toBe(1);

    // Delete source
    deleteManagedSource(db, 'custom_source');
    expect(getSourcesMap(db)['custom_source']).toBeUndefined();

    db.close();
  });
});
