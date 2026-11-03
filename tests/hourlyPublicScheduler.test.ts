import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDatabase,
  initDatabase,
  createUser,
  addManagedProduct,
  addManagedSource,
  recordPrice,
  startRun,
  getScheduledBatchTargets,
  getHourBounds,
  getDayBounds,
  getTimezoneHour,
  hasSuccessfulPriceThisHour,
  hasSuccessfulPriceToday,
  isPublicProduct,
  getPublicProductKeys,
} from '../src/lib/db';
import { TargetConfig } from '../src/lib/types';
import { PriceRunner } from '../src/lib/runner';

describe('Hourly Public Product Scheduler (8 AM - 23 PM)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let prevTzEnv: string | undefined;

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    prevTzEnv = process.env.APP_TIMEZONE;
    process.env.APP_TIMEZONE = 'Asia/Tehran';

    const tmpName = `hourly_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);
    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    process.env.APP_TIMEZONE = prevTzEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  describe('Timezone & Hour Calculation Helpers', () => {
    it('accurately calculates Tehran hour across UTC timestamps', () => {
      // 2026-11-03 04:30 UTC -> 08:00 Tehran (hour 8)
      const d8 = new Date('2026-11-03T04:30:00.000Z');
      expect(getTimezoneHour(d8, 'Asia/Tehran')).toBe(8);

      // 2026-11-03 19:30 UTC -> 23:00 Tehran (hour 23)
      const d23 = new Date('2026-11-03T19:30:00.000Z');
      expect(getTimezoneHour(d23, 'Asia/Tehran')).toBe(23);

      // 2026-11-03 20:30 UTC -> 00:00 Tehran (hour 0)
      const d0 = new Date('2026-11-03T20:30:00.000Z');
      expect(getTimezoneHour(d0, 'Asia/Tehran')).toBe(0);

      // 2026-11-03 03:30 UTC -> 07:00 Tehran (hour 7)
      const d7 = new Date('2026-11-03T03:30:00.000Z');
      expect(getTimezoneHour(d7, 'Asia/Tehran')).toBe(7);
    });

    it('calculates hour start and end bounds matching the local clock hour', () => {
      // At 08:25 Tehran time (04:55 UTC)
      const date = new Date('2026-11-03T04:55:00.000Z');
      const bounds = getHourBounds(date, 'Asia/Tehran');

      expect(bounds.hour).toBe(8);
      // Start of hour: 08:00 Tehran = 04:30 UTC
      expect(bounds.startOfHour).toBe('2026-11-03T04:30:00.000Z');
      // End of hour: 08:59:59.999 Tehran = 05:29:59.999 UTC
      expect(bounds.endOfHour).toBe('2026-11-03T05:29:59.999Z');
    });

    it('calculates day start and end bounds matching Tehran midnight', () => {
      const date = new Date('2026-11-03T12:00:00.000Z'); // 15:30 Tehran
      const bounds = getDayBounds(date, 'Asia/Tehran');

      // Start of day: 2026-11-03 00:00:00 Tehran = 2026-11-02 20:30:00 UTC
      expect(bounds.startOfDay).toBe('2026-11-02T20:30:00.000Z');
      // End of day: 2026-11-03 23:59:59.999 Tehran = 2026-11-03 20:29:59.999 UTC
      expect(bounds.endOfDay).toBe('2026-11-03T20:29:59.999Z');
    });
  });

  describe('Hourly Price Snapshot Check (hasSuccessfulPriceThisHour)', () => {
    it('returns false when no snapshot exists in this hour, true when it does', () => {
      const db = getDatabase();
      const user = createUser(db, { username: 'testuser', role: 'admin', password_hash: 'dummy-hash' });
      addManagedSource(db, { key: 'src_test', adapter: 'generic_html', currency: 'IRR', price_multiplier: 1 });
      addManagedProduct(db, {
        key: 'prod_public_1',
        title: 'Public 1',
        url: 'https://example.com/p1',
        source_key: 'src_test',
        is_public: true,
        user_id: user.id,
      });

      // At 09:15 Tehran time (05:45 UTC)
      const now0915 = new Date('2026-11-03T05:45:00.000Z');
      expect(hasSuccessfulPriceThisHour(db, 'prod_public_1', now0915, 'https://example.com/p1', 'src_test')).toBe(false);

      // Record snapshot at 09:10 Tehran time (05:40 UTC)
      const runId = startRun(db, null, null, undefined, undefined, 'test');
      recordPrice(db, runId, {
        product_key: 'prod_public_1',
        source_key: 'src_test',
        url: 'https://example.com/p1',
        enabled: true,
      }, {
        price_irr: 150000,
        availability: 'in_stock',
        raw_observation: {},
        title: 'Public 1',
      });
      // Update observed_at to 05:40 UTC
      db.prepare("UPDATE price_snapshots SET observed_at = '2026-11-03T05:40:00.000Z' WHERE product_key = 'prod_public_1'").run();

      // Now at 09:15, it should be true
      expect(hasSuccessfulPriceThisHour(db, 'prod_public_1', now0915, 'https://example.com/p1', 'src_test')).toBe(true);

      // In the NEXT hour at 10:05 Tehran time (06:35 UTC), it should be false!
      const nextHour1005 = new Date('2026-11-03T06:35:00.000Z');
      expect(hasSuccessfulPriceThisHour(db, 'prod_public_1', nextHour1005, 'https://example.com/p1', 'src_test')).toBe(false);

      db.close();
    });
  });

  describe('getScheduledBatchTargets with Public & Private Products', () => {
    it('collects public products every hour between 8:00 and 23:00, while batching private products', () => {
      const db = getDatabase();
      const user = createUser(db, { username: 'admin', role: 'admin', password_hash: 'dummy-hash' });
      addManagedSource(db, { key: 'src_test', adapter: 'generic_html', currency: 'IRR', price_multiplier: 1 });
      addManagedSource(db, { key: 'servix_market', adapter: 'servix_market', currency: 'IRR', price_multiplier: 1 });

      // 1 Market target
      addManagedProduct(db, {
        key: 'usd',
        title: 'USD Currency',
        url: 'https://example.com/usd',
        source_key: 'servix_market',
        is_public: true,
        user_id: user.id,
      });

      // 2 Public products
      addManagedProduct(db, {
        key: 'pub_laptop',
        title: 'Public Laptop',
        url: 'https://example.com/laptop',
        source_key: 'src_test',
        is_public: true,
        user_id: user.id,
      });
      addManagedProduct(db, {
        key: 'pub_mobile',
        title: 'Public Mobile',
        url: 'https://example.com/mobile',
        source_key: 'src_test',
        is_public: true,
        user_id: user.id,
      });

      // 6 Private products (to be batched across 24h -> Math.ceil(6 / 24) = 1 per hour)
      for (let i = 1; i <= 6; i++) {
        addManagedProduct(db, {
          key: `priv_${i}`,
          title: `Private ${i}`,
          url: `https://example.com/priv/${i}`,
          source_key: 'src_test',
          is_public: false,
          user_id: user.id,
        });
      }

      const activeTargets: TargetConfig[] = [
        { product_key: 'usd', source_key: 'servix_market', url: 'https://example.com/usd', enabled: true },
        { product_key: 'pub_laptop', source_key: 'src_test', url: 'https://example.com/laptop', enabled: true },
        { product_key: 'pub_mobile', source_key: 'src_test', url: 'https://example.com/mobile', enabled: true },
        ...Array.from({ length: 6 }, (_, i) => ({
          product_key: `priv_${i + 1}`,
          source_key: 'src_test',
          url: `https://example.com/priv/${i + 1}`,
          enabled: true,
        })),
      ];

      // CASE 1: At 10:00 AM Tehran time (06:30 UTC) - INSIDE 8..23 WINDOW
      const now10am = new Date('2026-11-03T06:30:00.000Z');
      const batch10am = getScheduledBatchTargets(db, activeTargets, { now: now10am });

      expect(batch10am.isPublicCollectionHour).toBe(true);
      expect(batch10am.totalPublicTargets).toBe(2);
      expect(batch10am.eligiblePublicTargets).toBe(2);
      expect(batch10am.totalPrivateTargets).toBe(6);
      expect(batch10am.eligiblePrivateTargets).toBe(6);
      expect(batch10am.batchSize).toBe(1); // Math.ceil(6 / 24) = 1

      // Targets must include: 1 market + 2 public + 1 private = 4 targets
      expect(batch10am.targets.length).toBe(4);
      const keys10am = batch10am.targets.map((t) => t.product_key);
      expect(keys10am).toContain('usd');
      expect(keys10am).toContain('pub_laptop');
      expect(keys10am).toContain('pub_mobile');
      expect(keys10am.filter((k) => k.startsWith('priv_')).length).toBe(1);

      // Record price for pub_laptop in hour 10 (at 10:05 Tehran = 06:35 UTC)
      const runId = startRun(db, null, null, undefined, undefined, 'test');
      recordPrice(db, runId, {
        product_key: 'pub_laptop',
        source_key: 'src_test',
        url: 'https://example.com/laptop',
        enabled: true,
      }, { price_irr: 1000, availability: 'in_stock', raw_observation: {} });
      db.prepare("UPDATE price_snapshots SET observed_at = '2026-11-03T06:35:00.000Z' WHERE product_key = 'pub_laptop'").run();

      // CASE 2: At 10:30 AM Tehran time (same hour 10)
      const now1030 = new Date('2026-11-03T07:00:00.000Z');
      const batch1030 = getScheduledBatchTargets(db, activeTargets, { now: now1030 });
      expect(batch1030.eligiblePublicTargets).toBe(1); // Only pub_mobile is eligible now
      const keys1030 = batch1030.targets.map((t) => t.product_key);
      expect(keys1030).not.toContain('pub_laptop');
      expect(keys1030).toContain('pub_mobile');

      // CASE 3: In NEXT hour at 11:15 AM Tehran time (07:45 UTC)
      const now1115 = new Date('2026-11-03T07:45:00.000Z');
      const batch1115 = getScheduledBatchTargets(db, activeTargets, { now: now1115 });
      // Both public products are eligible again in hour 11!
      expect(batch1115.eligiblePublicTargets).toBe(2);
      const keys1115 = batch1115.targets.map((t) => t.product_key);
      expect(keys1115).toContain('pub_laptop');
      expect(keys1115).toContain('pub_mobile');

      // CASE 4: At 03:00 AM Tehran time (23:30 UTC prev day) - OUTSIDE 8..23 WINDOW (NIGHT)
      const now03am = new Date('2026-11-02T23:30:00.000Z');
      const batch03am = getScheduledBatchTargets(db, activeTargets, { now: now03am });
      expect(batch03am.isPublicCollectionHour).toBe(false);
      expect(batch03am.eligiblePublicTargets).toBe(0); // Public products not collected at night!
      // Targets: 1 market + 0 public + 1 private = 2 targets
      expect(batch03am.targets.length).toBe(2);
      const keys03am = batch03am.targets.map((t) => t.product_key);
      expect(keys03am).toContain('usd');
      expect(keys03am).not.toContain('pub_laptop');
      expect(keys03am).not.toContain('pub_mobile');

      // CASE 5: At 23:15 PM Tehran time (19:45 UTC) - INSIDE 8..23 WINDOW (LAST HOUR)
      const now2315 = new Date('2026-11-03T19:45:00.000Z');
      const batch2315 = getScheduledBatchTargets(db, activeTargets, { now: now2315 });
      expect(batch2315.isPublicCollectionHour).toBe(true);
      expect(batch2315.eligiblePublicTargets).toBe(2);

      // CASE 6: force: true includes all targets regardless of hour
      const forceBatch = getScheduledBatchTargets(db, activeTargets, { force: true, now: now03am });
      expect(forceBatch.targets.length).toBe(activeTargets.length);

      db.close();
    });

    it('PriceRunner skips public product if already collected in current hour unless force is used', async () => {
      const db = getDatabase();
      const user = createUser(db, { username: 'runneruser', role: 'admin', password_hash: 'dummy-hash' });
      addManagedSource(db, { key: 'src_test', adapter: 'generic_html', currency: 'IRR', price_multiplier: 1 });
      addManagedProduct(db, {
        key: 'pub_item',
        title: 'Public Item',
        url: 'https://example.com/pub_item',
        source_key: 'src_test',
        is_public: true,
        user_id: user.id,
      });

      const targets: TargetConfig[] = [
        { product_key: 'pub_item', source_key: 'src_test', url: 'https://example.com/pub_item', enabled: true },
      ];

      // Insert snapshot within current hour
      const runId = startRun(db, null, null, undefined, undefined, 'test');
      recordPrice(db, runId, targets[0], {
        price_irr: 500000,
        availability: 'in_stock',
        raw_observation: {},
      });

      // Now create PriceRunner and executeRun without force
      const runner = new PriceRunner();
      const runId2 = startRun(db, null, null, undefined, undefined, 'test');
      const summary = await runner.executeRun(null, runId2, targets, { force: false });

      // Because it was already collected this hour, it should be skipped
      expect(summary.success_count).toBe(0);
      expect(summary.error_count).toBe(0);

      // With force = true, it runs regardless
      const runId3 = startRun(db, null, null, undefined, undefined, 'test');
      // When force is true, runner tries to fetch (and since example.com fails in test or mock, it will attempt)
      // This confirms it does NOT skip early
      const summary3 = await runner.executeRun(null, runId3, targets, { force: true });
      expect(summary3.target_count).toBe(1);

      db.close();
    });
  });
});

