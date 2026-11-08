import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDatabase,
  initDatabase,
  createUser,
  addManagedProduct,
  getManagedProducts,
  deleteManagedProduct,
} from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

describe('Target & Product Deduplication in Database Layer', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let user1Id: number;
  let user2Id: number;
  let user3Id: number;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `target_dedup_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    user1Id = createUser(db, { username: 'user_one', password_hash: hash, role: 'viewer' }).id;
    user2Id = createUser(db, { username: 'user_two', password_hash: hash, role: 'viewer' }).id;
    user3Id = createUser(db, { username: 'user_three', password_hash: hash, role: 'viewer' }).id;

    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

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

  it('allows a user to add multiple different cars sharing the same Iranjib URL without replacement', () => {
    const db = getDatabase();
    const iranjibUrl = 'https://www.iranjib.ir/showgroup/45/%D9%82%DB%8C%D9%85%D8%AA-%D8%AE%D9%88%D8%AF%D8%B1%D9%88-%D8%AA%D9%88%D9%84%DB%8C%D8%AF-%D8%AF%D8%A7%D8%AE%D9%84/';

    // User 1 adds first car (Peugeot 207)
    const car1 = addManagedProduct(db, {
      title: 'پژو ۲۰۷ دستی',
      url: iranjibUrl,
      source_key: 'iranjib',
      user_id: user1Id,
    });
    expect(car1.reused).toBe(false);
    expect(car1.product_key).toBeDefined();

    // User 1 adds second car (Dena Plus) sharing the exact same Iranjib URL
    const car2 = addManagedProduct(db, {
      title: 'دنا پلاس توربو',
      url: iranjibUrl,
      source_key: 'iranjib',
      user_id: user1Id,
    });
    expect(car2.reused).toBe(false);
    expect(car2.product_key).toBeDefined();
    expect(car2.product_key).not.toBe(car1.product_key);

    // Verify that User 1 has both products in their watchlist
    const user1Products = getManagedProducts(db, { userId: user1Id });
    expect(user1Products.length).toBe(2);
    const titles = user1Products.map((p) => p.title);
    expect(titles).toContain('پژو ۲۰۷ دستی');
    expect(titles).toContain('دنا پلاس توربو');

    // Another user (User 2) adds the same Peugeot 207 -> should be reused
    const car1User2 = addManagedProduct(db, {
      title: 'پژو ۲۰۷ دستی',
      url: iranjibUrl,
      source_key: 'iranjib',
      user_id: user2Id,
    });
    expect(car1User2.reused).toBe(true);
    expect(car1User2.product_key).toBe(car1.product_key);

    // Verify targets have correct distinct item_name in adapter_settings
    const target1 = db.prepare('SELECT * FROM managed_targets WHERE product_key = ?').get(car1.product_key) as any;
    const target2 = db.prepare('SELECT * FROM managed_targets WHERE product_key = ?').get(car2.product_key) as any;
    expect(JSON.parse(target1.adapter_settings).item_name).toBe('پژو ۲۰۷ دستی');
    expect(JSON.parse(target2.adapter_settings).item_name).toBe('دنا پلاس توربو');

    db.close();
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
});
