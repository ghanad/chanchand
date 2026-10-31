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
  getManagedProducts,
  getManagedTargets,
  deleteManagedProduct,
  recordPrice,
  latestSnapshots,
} from '../src/lib/db';
import { normalizeTargetUrl } from '../src/lib/urls';
import { PriceRunner } from '../src/lib/runner';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { GET as getProducts, POST as postProduct } from '../src/app/api/products/route';
import { DELETE as deleteProduct } from '../src/app/api/products/[key]/route';
import { POST as refreshProduct } from '../src/app/api/products/[key]/refresh/route';
import { GET as getHistory } from '../src/app/api/history/route';
import * as adaptersModule from '../src/lib/adapters';

describe('Product & Target Deduplication (Shared Catalog & User Watchlist)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let adminId: number;
  let user1Id: number;
  let user2Id: number;
  let user3Id: number;

  let adminCookie: string;
  let user1Cookie: string;
  let user2Cookie: string;
  let user3Cookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `dedup_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    adminId = createUser(db, { username: 'admin_user', password_hash: hash, role: 'admin' }).id;
    user1Id = createUser(db, { username: 'user_one', password_hash: hash, role: 'viewer' }).id;
    user2Id = createUser(db, { username: 'user_two', password_hash: hash, role: 'viewer' }).id;
    user3Id = createUser(db, { username: 'user_three', password_hash: hash, role: 'viewer' }).id;

    adminCookie = await signAuthToken({ id: adminId, username: 'admin_user', role: 'admin' });
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

  describe('normalizeTargetUrl', () => {
    it('canonicalizes Digikala URLs with different slugs and UTM tracking parameters', () => {
      const urlA = 'https://www.digikala.com/product/dkp-1234567/samsung-galaxy-s24/';
      const urlB = 'https://www.digikala.com/product/dkp-1234567/?utm_source=telegram&utm_medium=cpc';
      const urlC = 'https://digikala.com/product/1234567#reviews';

      const normA = normalizeTargetUrl(urlA);
      const normB = normalizeTargetUrl(urlB);
      const normC = normalizeTargetUrl(urlC);

      expect(normA).toBe('https://www.digikala.com/product/dkp-1234567/');
      expect(normB).toBe('https://www.digikala.com/product/dkp-1234567/');
      expect(normC).toBe('https://www.digikala.com/product/dkp-1234567/');
    });

    it('preserves Digikala variant_id when present', () => {
      const urlWithVariant = 'https://www.digikala.com/product/dkp-55555/slug/?variant_id=9876&utm_campaign=winter';
      const norm = normalizeTargetUrl(urlWithVariant);
      expect(norm).toBe('https://www.digikala.com/product/dkp-55555/?variant_id=9876');
    });

    it('strips tracking parameters and trailing slashes for generic ecommerce URLs', () => {
      const url1 = 'https://shop.example.com/items/laptop/?utm_source=google&fbclid=abc123xyz/';
      const url2 = 'https://shop.example.com/items/laptop';
      expect(normalizeTargetUrl(url1)).toBe('https://shop.example.com/items/laptop');
      expect(normalizeTargetUrl(url2)).toBe('https://shop.example.com/items/laptop');
    });
  });

  describe('Target & Product Deduplication across Users', () => {
    it('does not duplicate managed_targets or managed_products when two users add the same URL', () => {
      const db = getDatabase();

      // User 1 adds product
      const res1 = addManagedProduct(db, {
        title: 'گوشی سامسونگ گلکسی S24',
        url: 'https://www.digikala.com/product/dkp-987654/galaxy-s24/',
        user_id: user1Id,
      });

      expect(res1.reused).toBe(false);
      expect(res1.product_key).toBeDefined();

      // User 2 adds the SAME product with different title and tracking param
      const res2 = addManagedProduct(db, {
        title: 'Samsung S24 Ultra',
        url: 'https://www.digikala.com/product/dkp-987654/?utm_source=torob',
        user_id: user2Id,
      });

      expect(res2.reused).toBe(true);
      expect(res2.product_key).toBe(res1.product_key);

      // Verify database counts
      const products = db.prepare('SELECT * FROM managed_products').all();
      const targets = db.prepare('SELECT * FROM managed_targets').all();
      const userProducts = db.prepare('SELECT * FROM user_products').all();

      // Exactly ONE product and ONE target in the system
      expect(products.length).toBe(1);
      expect(targets.length).toBe(1);

      // But TWO user associations in user_products
      expect(userProducts.length).toBe(2);

      // Both users see the product in their own list
      const u1Prods = getManagedProducts(db, { userId: user1Id });
      const u2Prods = getManagedProducts(db, { userId: user2Id });

      expect(u1Prods.map((p) => p.key)).toEqual([res1.product_key]);
      expect(u2Prods.map((p) => p.key)).toEqual([res1.product_key]);

      // User 1 sees their custom title, User 2 sees their custom title
      expect(u1Prods[0].title).toBe('گوشی سامسونگ گلکسی S24');
      expect(u2Prods[0].title).toBe('Samsung S24 Ultra');

      // Unrelated User 3 does NOT see the product
      const u3Prods = getManagedProducts(db, { userId: user3Id });
      expect(u3Prods.length).toBe(0);

      db.close();
    });

    it('does NOT deduplicate market sources that share the same endpoint URL but have different symbols', () => {
      const db = getDatabase();

      // Seed market source
      db.prepare(`
        INSERT OR REPLACE INTO managed_sources (key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at)
        VALUES ('servix_market', 'servix_market', 10, 0, 'IRR', 1, '{}', '{}', datetime('now'), datetime('now'))
      `).run();

      const apiUrl = 'https://servix.cc/api/v1/assets';

      // Add Gold 18K
      const resGold = addManagedProduct(db, {
        title: 'طلای ۱۸ عیار',
        url: apiUrl,
        source_key: 'servix_market',
        user_id: user1Id,
        adapter_settings: { symbol: 'GOLD_18_RLS' },
      });
      expect(resGold.reused).toBe(false);

      // Add USD (same API URL, different symbol)
      const resUsd = addManagedProduct(db, {
        title: 'دلار',
        url: apiUrl,
        source_key: 'servix_market',
        user_id: user1Id,
        adapter_settings: { symbol: 'USD_RLS' },
      });
      expect(resUsd.reused).toBe(false);
      expect(resUsd.product_key).not.toBe(resGold.product_key);

      // User 2 adds USD again (same URL + same symbol) -> SHOULD be reused!
      const resUsd2 = addManagedProduct(db, {
        title: 'دلار بازار آزاد',
        url: apiUrl,
        source_key: 'servix_market',
        user_id: user2Id,
        adapter_settings: { symbol: 'USD_RLS' },
      });
      expect(resUsd2.reused).toBe(true);
      expect(resUsd2.product_key).toBe(resUsd.product_key);

      // Verify database counts: 2 distinct products and 2 distinct targets
      const products = db.prepare('SELECT * FROM managed_products WHERE key IN (?, ?)').all(resGold.product_key, resUsd.product_key);
      const targets = db.prepare('SELECT * FROM managed_targets WHERE product_key IN (?, ?)').all(resGold.product_key, resUsd.product_key);
      expect(products.length).toBe(2);
      expect(targets.length).toBe(2);

      db.close();
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

    it('safely handles deletion lifecycle: removes user link first, only prunes target when last user deletes', () => {
      const db = getDatabase();

      const targetUrl = 'https://www.digikala.com/product/dkp-888888/';
      const r = addManagedProduct(db, {
        title: 'کالای تست حذف',
        url: targetUrl,
        user_id: user1Id,
      });
      addManagedProduct(db, {
        title: 'کالای تست حذف کاربر ۲',
        url: targetUrl,
        user_id: user2Id,
      });

      // User 1 deletes product from their list
      deleteManagedProduct(db, r.product_key, { id: user1Id, role: 'viewer' });

      // Target and product STILL exist because User 2 is tracking it!
      const prodsAfterU1 = db.prepare('SELECT * FROM managed_products WHERE key = ?').all(r.product_key);
      const targetsAfterU1 = db.prepare('SELECT * FROM managed_targets WHERE product_key = ?').all(r.product_key);
      expect(prodsAfterU1.length).toBe(1);
      expect(targetsAfterU1.length).toBe(1);

      // User 1 no longer sees it
      expect(getManagedProducts(db, { userId: user1Id }).length).toBe(0);

      // User 2 STILL sees it
      const u2List = getManagedProducts(db, { userId: user2Id });
      expect(u2List.length).toBe(1);
      expect(u2List[0].key).toBe(r.product_key);

      // User 2 deletes product
      deleteManagedProduct(db, r.product_key, { id: user2Id, role: 'viewer' });

      // Now 0 users track it -> product and target are cleaned up!
      const prodsAfterU2 = db.prepare('SELECT * FROM managed_products WHERE key = ?').all(r.product_key);
      const targetsAfterU2 = db.prepare('SELECT * FROM managed_targets WHERE product_key = ?').all(r.product_key);
      expect(prodsAfterU2.length).toBe(0);
      expect(targetsAfterU2.length).toBe(0);

      db.close();
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
});
