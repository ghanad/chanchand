import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import {
  getDatabase,
  initDatabase,
  createUser,
  addManagedProduct,
} from '../src/lib/db';
import { PriceRunner } from '../src/lib/runner';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { POST as refreshProduct } from '../src/app/api/products/[key]/refresh/route';
import { GET as getHistory } from '../src/app/api/history/route';
import * as adaptersModule from '../src/lib/adapters';

describe('Product & Target Deduplication (Runner & API Integration)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let user1Id: number;
  let user2Id: number;
  let user3Id: number;

  let user1Cookie: string;
  let user2Cookie: string;
  let user3Cookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `dedup_api_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    user1Id = createUser(db, { username: 'user_one', password_hash: hash, role: 'viewer' }).id;
    user2Id = createUser(db, { username: 'user_two', password_hash: hash, role: 'viewer' }).id;
    user3Id = createUser(db, { username: 'user_three', password_hash: hash, role: 'viewer' }).id;

    user1Cookie = await signAuthToken({ id: user1Id, username: 'user_one', role: 'viewer' });
    user2Cookie = await signAuthToken({ id: user2Id, username: 'user_two', role: 'viewer' });
    user3Cookie = await signAuthToken({ id: user3Id, username: 'user_three', role: 'viewer' });

    db.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  it('collects price snapshot only ONCE and shares history between tracking users', async () => {
    let fetchCount = 0;
    vi.spyOn(adaptersModule, 'getAdapter').mockReturnValue({
      fetch: async () => {
        fetchCount++;
        return {
          title: 'Mock Product',
          price_irr: 500000000,
          availability: 'in_stock',
          raw_observation: { test: true },
        };
      },
    } as any);

    const db = getDatabase();

    // Seed mock source
    db.prepare(`
      INSERT OR REPLACE INTO managed_sources (key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at)
      VALUES ('mock_source', 'generic_html', 10, 0, 'IRR', 1, '{}', '{}', datetime('now'), datetime('now'))
    `).run();

    // User 1 & User 2 both add product
    const targetUrl = 'https://www.digikala.com/product/dkp-777777/';
    const r1 = addManagedProduct(db, {
      title: 'محصول مشترک',
      url: targetUrl,
      source_key: 'mock_source',
      user_id: user1Id,
    });
    addManagedProduct(db, {
      title: 'محصول مشترک ۲',
      url: targetUrl,
      source_key: 'mock_source',
      user_id: user2Id,
    });

    // Run runner
    const runner = new PriceRunner(process.env.PRICE_GETTER_DB_URL);
    const summary = await runner.run();

    expect(summary.success_count).toBe(1);
    expect(fetchCount).toBe(1); // Fetched ONLY once!

    // Verify only 1 snapshot stored
    const snapshots = db.prepare('SELECT * FROM price_snapshots WHERE product_key = ?').all(r1.product_key);
    expect(snapshots.length).toBe(1);

    db.close();

    // Test history API: User 1 can view history
    const reqHistoryU1 = new NextRequest(`https://example.com/api/history?product_key=${r1.product_key}`, {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}` },
    });
    const resU1 = await getHistory(reqHistoryU1);
    expect(resU1.status).toBe(200);
    const jsonU1 = await resU1.json();
    expect(jsonU1.rows.length).toBe(1);
    expect(jsonU1.rows[0].price_irr).toBe(500000000);

    // User 2 can also view history
    const reqHistoryU2 = new NextRequest(`https://example.com/api/history?product_key=${r1.product_key}`, {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}` },
    });
    const resU2 = await getHistory(reqHistoryU2);
    expect(resU2.status).toBe(200);
    const jsonU2 = await resU2.json();
    expect(jsonU2.rows.length).toBe(1);
    expect(jsonU2.rows[0].price_irr).toBe(500000000);

    // Unrelated User 3 gets 403 Forbidden
    const reqHistoryU3 = new NextRequest(`https://example.com/api/history?product_key=${r1.product_key}`, {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${user3Cookie}` },
    });
    const resU3 = await getHistory(reqHistoryU3);
    expect(resU3.status).toBe(403);
  });

  it('allows both tracking users to trigger manual refresh (POST /api/products/[key]/refresh)', async () => {
    const db = getDatabase();
    const targetUrl = 'https://www.digikala.com/product/dkp-444444/';
    const r = addManagedProduct(db, {
      title: 'کالای استعلام',
      url: targetUrl,
      user_id: user1Id,
    });
    addManagedProduct(db, {
      title: 'کالای استعلام ۲',
      url: targetUrl,
      user_id: user2Id,
    });
    db.close();

    // User 2 triggers manual refresh
    const reqU2 = new NextRequest(`https://example.com/api/products/${r.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}` },
    });
    const resU2 = await refreshProduct(reqU2, { params: Promise.resolve({ key: r.product_key }) });
    // Should not be 403 Forbidden!
    expect(resU2.status).not.toBe(403);

    // Unrelated User 3 triggers manual refresh -> 403 Forbidden
    const reqU3 = new NextRequest(`https://example.com/api/products/${r.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${user3Cookie}` },
    });
    const resU3 = await refreshProduct(reqU3, { params: Promise.resolve({ key: r.product_key }) });
    expect(resU3.status).toBe(403);
  });
});
