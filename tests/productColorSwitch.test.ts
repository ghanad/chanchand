import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import { getDatabase, initDatabase, createUser, addManagedProduct } from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { POST as postColor } from '../src/app/api/products/[key]/color/route';

const URL = 'https://www.digikala.com/product/dkp-18577783/';

describe('POST /api/products/[key]/color', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let cookie: string;
  let userId: number;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `color_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);
    const hash = await hashPassword('secret123');
    userId = createUser(db, { username: 'color_user', password_hash: hash, role: 'viewer' }).id;
    db.close();

    cookie = await signAuthToken({ id: userId, username: 'color_user', role: 'viewer' });
    // The colour switch may trigger a history backfill; keep it offline.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":429}', { status: 429 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  function request(key: string, body: Record<string, any>) {
    return new NextRequest(`https://example.com/api/products/${key}/color`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${AUTH_COOKIE_NAME}=${cookie}` },
      body: JSON.stringify(body),
    });
  }

  it('moves the user from the floor product to a colour product and frees the old slot', async () => {
    const db = getDatabase();
    const floor = addManagedProduct(db, {
      title: 'گوشی سامسونگ',
      url: URL,
      user_id: userId,
      is_public: false,
    });
    db.close();

    const res = await postColor(request(floor.product_key, { color_id: '82', color_label: 'زرد لیمویی' }), {
      params: Promise.resolve({ key: floor.product_key }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.product_key).not.toBe(floor.product_key);

    const dbAfter = getDatabase();
    const oldProduct = dbAfter
      .prepare('SELECT * FROM managed_products WHERE key = ?')
      .get(floor.product_key);
    expect(oldProduct).toBeUndefined();

    const newTarget = dbAfter
      .prepare('SELECT color_id, color_label FROM managed_targets WHERE product_key = ?')
      .get(json.product_key) as { color_id: string; color_label: string };
    expect(newTarget.color_id).toBe('82');
    expect(newTarget.color_label).toBe('زرد لیمویی');

    const watches = dbAfter
      .prepare('SELECT product_key FROM user_products WHERE user_id = ?')
      .all(userId) as Array<{ product_key: string }>;
    expect(watches.map((w) => w.product_key)).toEqual([json.product_key]);

    const title = dbAfter
      .prepare('SELECT title FROM managed_products WHERE key = ?')
      .get(json.product_key) as { title: string };
    expect(title.title).toBe('گوشی سامسونگ - زرد لیمویی');
    dbAfter.close();
  });

  it('switches between two colours without inflating the slot count', async () => {
    const db = getDatabase();
    const lemon = addManagedProduct(db, {
      title: 'گوشی سامسونگ',
      url: URL,
      user_id: userId,
      color_id: '82',
      color_label: 'زرد لیمویی',
    });
    db.close();

    const res = await postColor(request(lemon.product_key, { color_id: '83', color_label: 'سفید' }), {
      params: Promise.resolve({ key: lemon.product_key }),
    });
    const json = await res.json();

    const dbAfter = getDatabase();
    const watches = dbAfter
      .prepare('SELECT product_key FROM user_products WHERE user_id = ?')
      .all(userId) as Array<{ product_key: string }>;
    expect(watches).toHaveLength(1);
    expect(watches[0].product_key).toBe(json.product_key);

    const title = dbAfter
      .prepare('SELECT title FROM managed_products WHERE key = ?')
      .get(json.product_key) as { title: string };
    // the previous colour suffix must not pile up
    expect(title.title).toBe('گوشی سامسونگ - سفید');
    dbAfter.close();
  });

  it('is a no-op when the requested colour is already the current one', async () => {
    const db = getDatabase();
    const lemon = addManagedProduct(db, {
      title: 'گوشی سامسونگ',
      url: URL,
      user_id: userId,
      color_id: '82',
      color_label: 'زرد لیمویی',
    });
    db.close();

    const res = await postColor(request(lemon.product_key, { color_id: '82', color_label: 'زرد لیمویی' }), {
      params: Promise.resolve({ key: lemon.product_key }),
    });
    const json = await res.json();
    expect(json.unchanged).toBe(true);
    expect(json.product_key).toBe(lemon.product_key);
  });

  it('rejects users who do not track the product', async () => {
    const db = getDatabase();
    const other = createUser(db, { username: 'other_user', password_hash: 'x', role: 'viewer' });
    const product = addManagedProduct(db, {
      title: 'گوشی سامسونگ',
      url: URL,
      user_id: other.id,
      is_public: false,
    });
    db.close();

    const res = await postColor(request(product.product_key, { color_id: '83', color_label: 'سفید' }), {
      params: Promise.resolve({ key: product.product_key }),
    });
    expect(res.status).toBe(403);
  });
});
