import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PriceRunner } from '../src/lib/runner';
import { getDatabase, startRun, recordPrice, latestSnapshots } from '../src/lib/db';
import * as adaptersModule from '../src/lib/adapters';
import { HttpRequestError, httpFailureHint } from '../src/lib/adapters/fetchUtils';
import { USD_PRODUCT_KEY } from '../src/lib/serializers';
import { AppConfig, PriceObservation } from '../src/lib/types';

describe('PriceRunner module', () => {
  let tempDbPath: string;
  let tempDbUrl: string;

  beforeEach(() => {
    const tmpName = `runner_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    tempDbUrl = `sqlite:////${tempDbPath.replace(/^\//, '')}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  it('runs successfully with mock adapter and records snapshots', async () => {
    const db = getDatabase(tempDbUrl);
    const mockObs: PriceObservation = {
      title: 'محصول تست ۱',
      price_irr: 120000000,
      seller: 'فروشگاه تستی',
      availability: 'in_stock',
      raw_observation: { mocked: true },
    };

    const mockFetch = vi.fn().mockResolvedValue(mockObs);
    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({
      fetch: mockFetch,
    } as any);

    const config: AppConfig = {
      sources: {
        test_source: {
          adapter: 'generic_html',
          timeout_seconds: 5,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {
        prod_1: { title: 'محصول ۱' },
      },
      targets: [
        {
          product_key: 'prod_1',
          source_key: 'test_source',
          url: 'https://example.com/p1',
          enabled: true,
        },
      ],
    };

    const runner = new PriceRunner(tempDbUrl);
    const summary = await runner.run(config);

    expect(summary.status).toBe('success');
    expect(summary.success_count).toBe(1);
    expect(summary.error_count).toBe(0);
    expect(summary.target_count).toBe(1);

    const snapshots = latestSnapshots(db);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].product_key).toBe('prod_1');
    expect(snapshots[0].price_irr).toBe(120000000);

    db.close();
  });

  it('prioritizes USD targets before regular products', async () => {
    const db = getDatabase(tempDbUrl);
    const callOrder: string[] = [];

    vi.spyOn(adaptersModule, 'getAdapter').mockImplementation(() => ({
      fetch: async ({ target }: adaptersModule.FetchContext) => {
        callOrder.push(target.product_key);
        return {
          title: target.product_key,
          price_irr: 100000,
          seller: null,
          availability: 'in_stock',
          raw_observation: {},
        };
      },
    }) as any);

    const config: AppConfig = {
      sources: {
        src1: {
          adapter: 'generic_html',
          timeout_seconds: 5,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [
        { product_key: 'item_a', source_key: 'src1', url: 'https://example.com/a', enabled: true },
        { product_key: USD_PRODUCT_KEY, source_key: 'src1', url: 'https://example.com/usd', enabled: true },
        { product_key: 'item_b', source_key: 'src1', url: 'https://example.com/b', enabled: true },
      ],
    };

    const runner = new PriceRunner(tempDbUrl);
    const summary = await runner.run(config);

    expect(summary.success_count).toBe(3);
    // USD must be fetched first
    expect(callOrder[0]).toBe(USD_PRODUCT_KEY);

    db.close();
  });

  it('skips already fetched targets when force is false', async () => {
    const db = getDatabase(tempDbUrl);
    const runner = new PriceRunner(tempDbUrl);

    const target = {
      product_key: 'already_collected',
      source_key: 'test_src',
      url: 'https://example.com/item',
      enabled: true,
    };

    const runId = startRun(db, null, { sources: {}, products: {}, targets: [target] });
    // Pre-record a snapshot for today
    recordPrice(db, runId, target, {
      title: 'قبلاً ثبت شده',
      price_irr: 50000,
      seller: null,
      availability: 'in_stock',
      raw_observation: {},
    });

    const mockFetch = vi.fn();
    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({ fetch: mockFetch } as any);

    const config: AppConfig = {
      sources: {
        test_src: {
          adapter: 'generic_html',
          timeout_seconds: 5,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [target],
    };

    // Run without force: should skip
    const summary = await runner.run(config);
    expect(summary.success_count).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();

    // Run with force: should execute
    mockFetch.mockResolvedValueOnce({
      title: 'مجدداً واکشی شد',
      price_irr: 55000,
      seller: null,
      availability: 'in_stock',
      raw_observation: {},
    });

    const forceSummary = await runner.executeRun(config, 2, [target], { force: true });
    expect(forceSummary.success_count).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    db.close();
  });

  it('records fetch errors and marks run as partial or failed', async () => {
    const db = getDatabase(tempDbUrl);
    vi.spyOn(adaptersModule, 'getAdapter').mockImplementation(() => ({
      fetch: async ({ target }: adaptersModule.FetchContext) => {
        if (target.product_key === 'failing_item') {
          throw new Error('Timeout 504 Gateway');
        }
        return {
          title: 'محصول سالم',
          price_irr: 99000,
          seller: null,
          availability: 'in_stock',
          raw_observation: {},
        };
      },
    }) as any);

    const config: AppConfig = {
      sources: {
        test_src: {
          adapter: 'generic_html',
          timeout_seconds: 5,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [
        { product_key: 'good_item', source_key: 'test_src', url: 'https://example.com/good', enabled: true },
        { product_key: 'failing_item', source_key: 'test_src', url: 'https://example.com/bad', enabled: true },
      ],
    };

    const runner = new PriceRunner(tempDbUrl);
    const summary = await runner.run(config);

    expect(summary.success_count).toBe(1);
    expect(summary.error_count).toBe(1);
    expect(summary.status).toBe('partial');

    const errorRows = db.prepare('SELECT * FROM fetch_errors').all() as any[];
    expect(errorRows.length).toBe(1);
    expect(errorRows[0].product_key).toBe('failing_item');
    expect(errorRows[0].message).toContain('Timeout 504 Gateway');

    db.close();
  });

  it('logs failures with a local timestamp and records the HTTP reason', async () => {
    const db = getDatabase(tempDbUrl);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({
      fetch: async () => {
        throw new HttpRequestError('Servix', 'https://servix.cc/api/v1/assets', 429, 'Too Many Requests', {
          retryAfterSeconds: 60,
          responseExcerpt: '{"message":"too many requests"}',
          hint: httpFailureHint(429),
        });
      },
    } as any);

    const config: AppConfig = {
      sources: {
        servix_market: {
          adapter: 'servix_market',
          timeout_seconds: 5,
          rate_limit_seconds: 3,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [
        {
          product_key: 'coin-emami',
          source_key: 'servix_market',
          url: 'https://servix.cc/api/v1/assets',
          enabled: true,
        },
      ],
    };

    const runner = new PriceRunner(tempDbUrl);
    const summary = await runner.run(config);
    expect(summary.status).toBe('failed');

    const warnLines = warnSpy.mock.calls.map((call) => String(call[0]));
    const failureLine = warnLines.find((line) => line.includes('failed market group servix_market'));
    expect(failureLine).toBeDefined();
    expect(failureLine).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}\] WARN \[Runner\]/);
    expect(failureLine).toContain('status=429');
    expect(failureLine).toContain('retry_after=60');
    expect(failureLine).toContain('Servix rate limit exceeded');
    expect(failureLine).toContain('rate_limit_seconds=3');
    expect(failureLine).toContain('products=1');

    const errorRow = db.prepare('SELECT * FROM fetch_errors ORDER BY id DESC LIMIT 1').get() as any;
    expect(errorRow.error_type).toBe('HttpRequestError');
    expect(errorRow.message).toContain('rate limit exceeded (HTTP 429 Too Many Requests)');
    expect(errorRow.message).toContain('retry after 60s');

    const raw = JSON.parse(errorRow.raw_observation);
    expect(raw.status).toBe(429);
    expect(raw.retry_after).toBe(60);
    expect(raw.hint).toContain('rate_limit_seconds');
    expect(raw.response_excerpt).toContain('too many requests');

    db.close();
  });

  it('enforces rate limiting delay between requests to same source', async () => {
    const runner = new PriceRunner(tempDbUrl);
    const timestamps: number[] = [];

    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({
      fetch: async () => {
        timestamps.push(Date.now());
        return {
          title: 'Rate Limit Test',
          price_irr: 1000,
          seller: null,
          availability: 'in_stock',
          raw_observation: {},
        };
      },
    } as any);

    const config: AppConfig = {
      sources: {
        limited_source: {
          adapter: 'generic_html',
          timeout_seconds: 5,
          rate_limit_seconds: 0.15, // 150ms rate limit
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [
        { product_key: 'p1', source_key: 'limited_source', url: 'https://example.com/1', enabled: true },
        { product_key: 'p2', source_key: 'limited_source', url: 'https://example.com/2', enabled: true },
      ],
    };

    const summary = await runner.run(config);
    expect(summary.success_count).toBe(2);
    expect(timestamps.length).toBe(2);

    const diff = timestamps[1] - timestamps[0];
    expect(diff).toBeGreaterThanOrEqual(100);

    const db = getDatabase(tempDbUrl);
    db.close();
  });

  it('collects all market targets sharing the same endpoint URL once per hour without cache collision', async () => {
    const runner = new PriceRunner(tempDbUrl);
    const fetchedSymbols: string[] = [];

    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({
      fetch: async ({ target }: adaptersModule.FetchContext) => {
        const symbol = target.adapter_settings?.symbol || 'UNKNOWN';
        fetchedSymbols.push(symbol);
        const price = symbol === 'USD_RLS' ? 2700000 : 260000000;
        return {
          title: symbol,
          price_irr: price,
          seller: 'Servix',
          availability: 'in_stock',
          raw_observation: { symbol },
        };
      },
    } as any);

    const config: AppConfig = {
      sources: {
        servix_market: {
          adapter: 'servix_market',
          timeout_seconds: 5,
          rate_limit_seconds: 0,
          currency: 'IRR',
          price_multiplier: 1,
          headers: {},
          settings: {},
        },
      },
      products: {},
      targets: [
        {
          product_key: 'usd',
          source_key: 'servix_market',
          url: 'https://servix.cc/api/v1/assets',
          enabled: true,
          adapter_settings: { symbol: 'USD_RLS' },
        },
        {
          product_key: 'gold-18k',
          source_key: 'servix_market',
          url: 'https://servix.cc/api/v1/assets',
          enabled: true,
          adapter_settings: { symbol: 'GOLD_18_RLS' },
        },
      ],
    };

    // First run: collect both
    const summary1 = await runner.run(config, undefined, config.targets);
    expect(summary1.success_count).toBe(2);
    expect(fetchedSymbols).toEqual(['USD_RLS', 'GOLD_18_RLS']);

    // Second run in the same hour: market products are throttled to one poll per hour so a
    // small provider quota (e.g. 50 requests/day) is not burned by repeated cron triggers.
    const summary2 = await runner.run(config, undefined, config.targets, { force: false });
    expect(summary2.success_count).toBe(0);
    expect(fetchedSymbols).toEqual(['USD_RLS', 'GOLD_18_RLS']);

    // force=true still refreshes them on demand (manual "run now").
    const summary3 = await runner.run(config, undefined, config.targets, { force: true });
    expect(summary3.success_count).toBe(2);
    expect(fetchedSymbols).toEqual(['USD_RLS', 'GOLD_18_RLS', 'USD_RLS', 'GOLD_18_RLS']);

    const db = getDatabase(tempDbUrl);
    const snapshots = latestSnapshots(db);
    const usdSnap = snapshots.find((s) => s.product_key === 'usd');
    const goldSnap = snapshots.find((s) => s.product_key === 'gold-18k');
    expect(usdSnap?.price_irr).toBe(2700000);
    expect(goldSnap?.price_irr).toBe(260000000);

    db.close();
  });
});

