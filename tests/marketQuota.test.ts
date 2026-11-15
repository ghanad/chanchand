import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDatabase,
  initDatabase,
  addManagedProduct,
  addManagedSource,
  startRun,
  getProductScheduleMap,
  getScheduledBatchTargets,
} from '../src/lib/db';
import { PriceRunner } from '../src/lib/runner';
import { resetAdapterInstances } from '../src/lib/adapters';
import { TargetConfig } from '../src/lib/types';

const SERVIX_URL = 'https://servix.cc/api/v1/assets';

const servixPayload = [
  { code: 'USD_RLS', labelFa: 'دلار آمریکا', value: 2_700_000, quoteUnit: 'RLS' },
  { code: 'GOLD_18_RLS', labelFa: 'طلای ۱۸ عیار', value: 260_000_000, quoteUnit: 'RLS' },
  { code: 'GOLD_24_RLS', labelFa: 'طلای ۲۴ عیار', value: 340_000_000, quoteUnit: 'RLS' },
  { code: 'SEKKEH_RLS', labelFa: 'سکه امامی', value: 2_750_000_000, quoteUnit: 'RLS' },
  { code: 'NIM_SEKKEH_RLS', labelFa: 'نیم سکه', value: 1_400_000_000, quoteUnit: 'RLS' },
  { code: 'ROB_SEKKEH_RLS', labelFa: 'ربع سکه', value: 900_000_000, quoteUnit: 'RLS' },
];

describe('Market provider quota (50 requests/day) and per-product collection windows', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let prevApiKey: string | undefined;
  let prevTz: string | undefined;

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    prevApiKey = process.env.SERVIX_API_KEY;
    prevTz = process.env.APP_TIMEZONE;
    process.env.SERVIX_API_KEY = 'test-servix-key';
    process.env.APP_TIMEZONE = 'Asia/Tehran';

    const tmpName = `quota_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);
    db.close();
    resetAdapterInstances();
  });

  afterEach(() => {
    resetAdapterInstances();
    vi.restoreAllMocks();
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    process.env.APP_TIMEZONE = prevTz;
    if (prevApiKey === undefined) delete process.env.SERVIX_API_KEY;
    else process.env.SERVIX_API_KEY = prevApiKey;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  function seedMarketProducts(hours: { start: number; end: number } = { start: 0, end: 23 }) {
    const db = getDatabase();
    addManagedSource(db, {
      key: 'servix_market',
      adapter: 'servix_market',
      currency: 'IRR',
      price_multiplier: 1,
      rate_limit_seconds: 0,
    });

    const symbols = ['USD_RLS', 'GOLD_18_RLS', 'GOLD_24_RLS', 'SEKKEH_RLS', 'NIM_SEKKEH_RLS', 'ROB_SEKKEH_RLS'];
    for (const symbol of symbols) {
      addManagedProduct(db, {
        key: symbol.toLowerCase(),
        title: symbol,
        url: SERVIX_URL,
        source_key: 'servix_market',
        is_public: true,
        active_start_hour: hours.start,
        active_end_hour: hours.end,
        adapter_settings: { symbol },
      });
    }

    const targets: TargetConfig[] = symbols.map((symbol) => ({
      product_key: symbol.toLowerCase(),
      source_key: 'servix_market',
      url: SERVIX_URL,
      enabled: true,
      adapter_settings: { symbol },
    }));
    db.close();
    return targets;
  }

  it('fetches every market price with a single HTTP request per run', async () => {
    const targets = seedMarketProducts();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(servixPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const db = getDatabase();
    const runId = startRun(db, null, null, targets, undefined, 'cron');
    const summary = await new PriceRunner().executeRun(null, runId, targets, { force: true });

    // All six market products are collected...
    expect(summary.success_count).toBe(6);
    // ...but the provider only sees one request, because the adapter caches the
    // whole market snapshot and every product is parsed from that same payload.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const prices = db.prepare('SELECT product_key, price_irr FROM price_snapshots ORDER BY product_key').all() as any[];
    expect(prices).toHaveLength(6);
    expect(prices.find((p) => p.product_key === 'usd_rls')?.price_irr).toBe(2_700_000);
    expect(prices.find((p) => p.product_key === 'sekkeh_rls')?.price_irr).toBe(2_750_000_000);

    db.close();
  });

  it('does not call the provider again when a second run happens in the same hour', async () => {
    const targets = seedMarketProducts();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(servixPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const db = getDatabase();
    const firstRun = startRun(db, null, null, targets, undefined, 'cron');
    await new PriceRunner().executeRun(null, firstRun, targets, { force: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const secondRun = startRun(db, null, null, targets, undefined, 'cron');
    const summary = await new PriceRunner().executeRun(null, secondRun, targets, { force: false });

    expect(summary.success_count).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    db.close();
  });

  it('skips market products outside their configured window', async () => {
    // 11:00 to 23:00 — the exact case the admin asked for.
    const targets = seedMarketProducts({ start: 11, end: 23 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T06:30:00.000Z')); // 10:00 Tehran
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(servixPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const db = getDatabase();
    const at10am = new Date('2026-11-15T06:30:00.000Z'); // 10:00 Tehran

    const batch = getScheduledBatchTargets(db, targets, { now: at10am });
    expect(batch.eligibleMarketTargets).toBe(0);
    expect(batch.targets).toHaveLength(0);

    const runId = startRun(db, null, null, targets, undefined, 'cron');
    const summary = await new PriceRunner().executeRun(null, runId, targets, { force: false });
    expect(summary.success_count).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    db.close();
    vi.useRealTimers();
  });

  it('collects market products inside their configured window', () => {
    const targets = seedMarketProducts({ start: 11, end: 23 });
    const db = getDatabase();

    const at11am = new Date('2026-11-15T07:30:00.000Z'); // 11:00 Tehran
    const batch = getScheduledBatchTargets(db, targets, { now: at11am });
    expect(batch.eligibleMarketTargets).toBe(6);
    expect(batch.targets).toHaveLength(6);

    db.close();
  });

  it('throttles market products by the configured poll interval', async () => {
    const targets = seedMarketProducts();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(servixPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const db = getDatabase();
    // Ask the source to poll every 3 hours instead of the default 60 minutes.
    db.prepare('UPDATE managed_sources SET settings = ? WHERE key = ?').run(
      JSON.stringify({ market_poll_interval_minutes: 180 }),
      'servix_market'
    );

    const firstRun = startRun(db, null, null, targets, undefined, 'cron');
    await new PriceRunner().executeRun(null, firstRun, targets, { force: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // One hour later the interval has not elapsed yet.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000));
    const secondRun = startRun(db, null, null, targets, undefined, 'cron');
    const skipped = await new PriceRunner().executeRun(null, secondRun, targets, { force: false });
    expect(skipped.success_count).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Well past the 3-hour interval it polls again.
    vi.setSystemTime(new Date(Date.now() + 4 * 60 * 60 * 1000));
    const thirdRun = startRun(db, null, null, targets, undefined, 'cron');
    const collected = await new PriceRunner().executeRun(null, thirdRun, targets, { force: false });
    expect(collected.success_count).toBe(6);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    db.close();
  });

  it('exposes the configured window of every product, public or private', () => {
    const targets = seedMarketProducts({ start: 11, end: 23 });
    const db = getDatabase();
    addManagedSource(db, { key: 'shop_src', adapter: 'generic_html', currency: 'IRR', price_multiplier: 1 });
    addManagedProduct(db, {
      key: 'private-item',
      title: 'Private item',
      url: 'https://example.com/item',
      source_key: 'shop_src',
      is_public: false,
      active_start_hour: 9,
      active_end_hour: 18,
    });

    const map = getProductScheduleMap(db);
    expect(map.get('usd_rls')).toEqual({ startHour: 11, endHour: 23 });
    expect(map.get('private-item')).toEqual({ startHour: 9, endHour: 18 });
    expect(targets).toHaveLength(6);

    db.close();
  });
});
