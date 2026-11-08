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
  getHourBounds,
  getDayBounds,
  getTimezoneHour,
  hasSuccessfulPriceThisHour,
  isHourInWindow,
} from '../src/lib/db';

describe('Timezone & Hour Calculation Helpers', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let prevTzEnv: string | undefined;

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    prevTzEnv = process.env.APP_TIMEZONE;
    process.env.APP_TIMEZONE = 'Asia/Tehran';

    const tmpName = `tz_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
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

  it('evaluates whether hour is in window correctly', () => {
    expect(isHourInWindow(10, 8, 23)).toBe(true);
    expect(isHourInWindow(7, 8, 23)).toBe(false);
    expect(isHourInWindow(23, 8, 23)).toBe(true);
    expect(isHourInWindow(0, 8, 23)).toBe(false);

    // Overnight window: 22 to 4
    expect(isHourInWindow(23, 22, 4)).toBe(true);
    expect(isHourInWindow(2, 22, 4)).toBe(true);
    expect(isHourInWindow(5, 22, 4)).toBe(false);
  });

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
