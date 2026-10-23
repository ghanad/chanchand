import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PriceRunner } from '../src/lib/runner';
import { getDatabase, startRun, recordPrice, latestSnapshots } from '../src/lib/db';
import * as adaptersModule from '../src/lib/adapters';
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
      fetch: async ({ target }) => {
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
      fetch: async ({ target }) => {
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
});
