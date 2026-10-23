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
});
