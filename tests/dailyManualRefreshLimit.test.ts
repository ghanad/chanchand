import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import {
  getDatabase,
  initDatabase,
  createUser,
  addManagedProduct,
  hasUserRefreshedProductToday,
  recordProductRefresh,
} from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { GET as getProducts } from '../src/app/api/products/route';
import { POST as refreshProduct } from '../src/app/api/products/[key]/refresh/route';

describe('Daily Manual Price Refresh Rate Limit for Regular Users', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let adminId: number;
  let regularUserId: number;

  let adminCookie: string;
  let regularUserCookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `refresh_limit_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    adminId = createUser(db, { username: 'admin_user', password_hash: hash, role: 'admin' }).id;
    regularUserId = createUser(db, { username: 'regular_user', password_hash: hash, role: 'viewer' }).id;

    adminCookie = await signAuthToken({ id: adminId, username: 'admin_user', role: 'admin' });
    regularUserCookie = await signAuthToken({ id: regularUserId, username: 'regular_user', role: 'viewer' });

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

  it('records refresh in DB and identifies if refreshed today', () => {
    const db = getDatabase();
    const p = addManagedProduct(db, {
      title: 'گوشی موبایل',
      url: 'https://example.com/product/phone-1',
      user_id: regularUserId,
    });

    expect(hasUserRefreshedProductToday(db, regularUserId, p.product_key)).toBe(false);

    recordProductRefresh(db, regularUserId, p.product_key);

    expect(hasUserRefreshedProductToday(db, regularUserId, p.product_key)).toBe(true);

    // Other user or other product has not refreshed today
    expect(hasUserRefreshedProductToday(db, adminId, p.product_key)).toBe(false);
    expect(hasUserRefreshedProductToday(db, regularUserId, 'other_product')).toBe(false);

    db.close();
  });

  it('allows regular user to refresh only once per day per product and blocks repeat calls with 429', async () => {
    const db = getDatabase();
    const p1 = addManagedProduct(db, {
      title: 'محصول ۱',
      url: 'https://example.com/product/item-1',
      user_id: regularUserId,
    });
    const p2 = addManagedProduct(db, {
      title: 'محصول ۲',
      url: 'https://example.com/product/item-2',
      user_id: regularUserId,
    });
    db.close();

    // 1. Initial product list: can_refresh should be true for both
    const reqList1 = new NextRequest('https://example.com/api/products', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resList1 = await getProducts(reqList1);
    const jsonList1 = await resList1.json();
    const prod1Before = jsonList1.products.find((p: any) => p.key === p1.product_key);
    const prod2Before = jsonList1.products.find((p: any) => p.key === p2.product_key);
    expect(prod1Before.can_refresh).toBe(true);
    expect(prod2Before.can_refresh).toBe(true);

    // 2. First refresh attempt on Product 1 -> should succeed
    const reqRefresh1 = new NextRequest(`https://example.com/api/products/${p1.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resRefresh1 = await refreshProduct(reqRefresh1, { params: Promise.resolve({ key: p1.product_key }) });
    expect(resRefresh1.status).toBe(200);
    const jsonRefresh1 = await resRefresh1.json();
    expect(jsonRefresh1.product_key).toBe(p1.product_key);
    expect(jsonRefresh1.can_refresh).toBe(false);

    // 3. Second refresh attempt on Product 1 on the same day -> 429 Rate Limit
    const reqRefresh2 = new NextRequest(`https://example.com/api/products/${p1.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resRefresh2 = await refreshProduct(reqRefresh2, { params: Promise.resolve({ key: p1.product_key }) });
    expect(resRefresh2.status).toBe(429);
    const jsonRefresh2 = await resRefresh2.json();
    expect(jsonRefresh2.error).toContain('یک بار در روز');
    expect(jsonRefresh2.code).toBe('DAILY_REFRESH_LIMIT_EXCEEDED');

    // 4. Checking product list now: Product 1 has can_refresh = false, Product 2 still can_refresh = true
    const reqList2 = new NextRequest('https://example.com/api/products', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resList2 = await getProducts(reqList2);
    const jsonList2 = await resList2.json();
    const prod1After = jsonList2.products.find((p: any) => p.key === p1.product_key);
    const prod2After = jsonList2.products.find((p: any) => p.key === p2.product_key);
    expect(prod1After.can_refresh).toBe(false);
    expect(prod2After.can_refresh).toBe(true);

    // 5. Product 2 can still be refreshed once today
    const reqRefreshP2 = new NextRequest(`https://example.com/api/products/${p2.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resRefreshP2 = await refreshProduct(reqRefreshP2, { params: Promise.resolve({ key: p2.product_key }) });
    expect(resRefreshP2.status).toBe(200);

    // Now Product 2 also hits rate limit on retry
    const reqRefreshP2Retry = new NextRequest(`https://example.com/api/products/${p2.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${regularUserCookie}` },
    });
    const resRefreshP2Retry = await refreshProduct(reqRefreshP2Retry, { params: Promise.resolve({ key: p2.product_key }) });
    expect(resRefreshP2Retry.status).toBe(429);
  });

  it('exempts admin users from the daily refresh rate limit', async () => {
    const db = getDatabase();
    const p = addManagedProduct(db, {
      title: 'محصول ادمین',
      url: 'https://example.com/product/admin-item',
      user_id: adminId,
    });
    db.close();

    // Admin can refresh 1st time
    const req1 = new NextRequest(`https://example.com/api/products/${p.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminCookie}` },
    });
    const res1 = await refreshProduct(req1, { params: Promise.resolve({ key: p.product_key }) });
    expect(res1.status).toBe(200);

    // Admin can refresh 2nd time without 429
    const req2 = new NextRequest(`https://example.com/api/products/${p.product_key}/refresh`, {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminCookie}` },
    });
    const res2 = await refreshProduct(req2, { params: Promise.resolve({ key: p.product_key }) });
    expect(res2.status).toBe(200);

    // In product list for admin, can_refresh is always true
    const reqList = new NextRequest('https://example.com/api/products', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminCookie}` },
    });
    const resList = await getProducts(reqList);
    const jsonList = await resList.json();
    const adminProd = jsonList.products.find((item: any) => item.key === p.product_key);
    expect(adminProd.can_refresh).toBe(true);
  });
});
