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
} from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { GET as getProducts, POST as postProduct } from '../src/app/api/products/route';
import { PUT as putProduct, DELETE as deleteProduct } from '../src/app/api/products/[key]/route';
import { GET as getHistory } from '../src/app/api/history/route';

describe('Multi-user Product Ownership and Public Market Items (API & RBAC)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let adminId: number;
  let user1Id: number;
  let user2Id: number;

  let adminCookie: string;
  let user1Cookie: string;
  let user2Cookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `multiuser_api_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    adminId = createUser(db, { username: 'admin_user', password_hash: hash, role: 'admin' }).id;
    user1Id = createUser(db, { username: 'user_one', password_hash: hash, role: 'viewer' }).id;
    user2Id = createUser(db, { username: 'user_two', password_hash: hash, role: 'viewer' }).id;

    adminCookie = await signAuthToken({ id: adminId, username: 'admin_user', role: 'admin' });
    user1Cookie = await signAuthToken({ id: user1Id, username: 'user_one', role: 'viewer' });
    user2Cookie = await signAuthToken({ id: user2Id, username: 'user_two', role: 'viewer' });

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

  describe('API Endpoints Access and RBAC', () => {
    it('GET /api/products returns filtered products and accurate can_edit flag', async () => {
      const db = getDatabase();
      addManagedProduct(db, {
        title: 'دلار آزاد',
        url: 'https://example.com/usd',
        key: 'usd',
        user_id: adminId,
        is_public: true,
      });
      addManagedProduct(db, {
        title: 'ساعت هوشمند',
        url: 'https://example.com/watch',
        key: 'smart-watch',
        user_id: user1Id,
        is_public: false,
      });
      db.close();

      // User 1 request
      const reqU1 = new NextRequest('https://example.com/api/products', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}` },
      });
      const resU1 = await getProducts(reqU1);
      const jsonU1 = await resU1.json();

      expect(jsonU1.products).toHaveLength(2);
      const watchProd = jsonU1.products.find((p: any) => p.key === 'smart-watch');
      const usdProd = jsonU1.products.find((p: any) => p.key === 'usd');

      expect(watchProd.can_edit).toBe(true);
      expect(watchProd.is_public).toBe(false);

      expect(usdProd.can_edit).toBe(false); // viewer cannot edit public market item
      expect(usdProd.is_public).toBe(true);

      // User 2 request (should only see public usd, not watch)
      const reqU2 = new NextRequest('https://example.com/api/products', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}` },
      });
      const resU2 = await getProducts(reqU2);
      const jsonU2 = await resU2.json();

      expect(jsonU2.products.map((p: any) => p.key)).toEqual(['usd']);
      expect(jsonU2.products[0].can_edit).toBe(false);
    });

    it('POST /api/products allows regular users to create products with user_id', async () => {
      const req = new NextRequest('https://example.com/api/products', {
        method: 'POST',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'کیبورد مکانیکی',
          url: 'https://example.com/keyboard',
          is_public: true, // viewer attempts to make it public
        }),
      });

      const res = await postProduct(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.product_key).toBeDefined();

      const db = getDatabase();
      const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(json.product_key) as any;
      expect(prod.user_id).toBe(user1Id);
      expect(prod.is_public).toBe(0); // regular user cannot create public items
      db.close();
    });

    it('PUT and DELETE /api/products/[key] enforce ownership', async () => {
      const db = getDatabase();
      addManagedProduct(db, {
        title: 'ماوس بی‌سیم',
        url: 'https://example.com/mouse',
        key: 'wireless-mouse',
        user_id: user1Id,
        is_public: false,
      });
      db.close();

      // User 2 attempts to edit User 1's product -> 400 with unauthorized message
      const reqPutWrong = new NextRequest('https://example.com/api/products/wireless-mouse', {
        method: 'PUT',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'تلاش برای ویرایش',
          url: 'https://example.com/hacked-mouse',
        }),
      });

      const resPutWrong = await putProduct(reqPutWrong, { params: Promise.resolve({ key: 'wireless-mouse' }) });
      expect(resPutWrong.status).toBe(400);
      const jsonPutWrong = await resPutWrong.json();
      expect(jsonPutWrong.error).toContain('دسترسی غیرمجاز');

      // User 1 successfully edits
      const reqPutOk = new NextRequest('https://example.com/api/products/wireless-mouse', {
        method: 'PUT',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'ماوس بی‌سیم گیمینگ',
          url: 'https://example.com/gaming-mouse',
        }),
      });

      const resPutOk = await putProduct(reqPutOk, { params: Promise.resolve({ key: 'wireless-mouse' }) });
      expect(resPutOk.status).toBe(200);

      // User 2 attempts to delete User 1's product -> 400
      const reqDelWrong = new NextRequest('https://example.com/api/products/wireless-mouse', {
        method: 'DELETE',
        headers: { cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}` },
      });
      const resDelWrong = await deleteProduct(reqDelWrong, { params: Promise.resolve({ key: 'wireless-mouse' }) });
      expect(resDelWrong.status).toBe(400);

      // User 1 successfully deletes their own product
      const reqDelOk = new NextRequest('https://example.com/api/products/wireless-mouse', {
        method: 'DELETE',
        headers: { cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}` },
      });
      const resDelOk = await deleteProduct(reqDelOk, { params: Promise.resolve({ key: 'wireless-mouse' }) });
      expect(resDelOk.status).toBe(200);
    });

    it('GET /api/history denies access to other users private products', async () => {
      const db = getDatabase();
      addManagedProduct(db, {
        title: 'لپتاپ خصوصی',
        url: 'https://example.com/laptop',
        key: 'private-laptop',
        user_id: user1Id,
        is_public: false,
      });
      db.close();

      const reqHistory = new NextRequest('https://example.com/api/history?product_key=private-laptop', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${user2Cookie}` },
      });

      const resHistory = await getHistory(reqHistory);
      expect(resHistory.status).toBe(403);
      const json = await resHistory.json();
      expect(json.error).toContain('دسترسی غیرمجاز');
    });

    it('allows admin to set and update show_usd_chart for public products, but ignores it for non-admin', async () => {
      // 1. Admin creates public product with show_usd_chart = true
      const reqAdminPost = new NextRequest('https://example.com/api/products', {
        method: 'POST',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${adminCookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'طلای آبشده نقدی',
          url: 'https://example.com/gold-melted',
          is_public: true,
          show_usd_chart: true,
        }),
      });
      const resAdminPost = await postProduct(reqAdminPost);
      expect(resAdminPost.status).toBe(200);
      const { product_key: goldKey } = await resAdminPost.json();

      // Check DB
      const db = getDatabase();
      const goldProd = db.prepare('SELECT is_public, show_usd_chart FROM managed_products WHERE key = ?').get(goldKey) as any;
      expect(goldProd.is_public).toBe(1);
      expect(goldProd.show_usd_chart).toBe(1);
      db.close();

      // Check GET /api/products
      const reqGet = new NextRequest('https://example.com/api/products', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${adminCookie}` },
      });
      const resGet = await getProducts(reqGet);
      const jsonGet = await resGet.json();
      const foundGold = jsonGet.products.find((p: any) => p.key === goldKey);
      expect(foundGold.is_public).toBe(true);
      expect(foundGold.show_usd_chart).toBe(true);

      // 2. Admin updates show_usd_chart to false
      const reqAdminPut = new NextRequest(`https://example.com/api/products/${goldKey}`, {
        method: 'PUT',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${adminCookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'طلای آبشده نقدی',
          url: 'https://example.com/gold-melted',
          is_public: true,
          show_usd_chart: false,
        }),
      });
      const resAdminPut = await putProduct(reqAdminPut, { params: Promise.resolve({ key: goldKey }) });
      expect(resAdminPut.status).toBe(200);

      // Verify DB updated
      const db2 = getDatabase();
      const goldProdUpdated = db2.prepare('SELECT is_public, show_usd_chart FROM managed_products WHERE key = ?').get(goldKey) as any;
      expect(goldProdUpdated.show_usd_chart).toBe(0);
      db2.close();

      // 3. Non-admin attempts to create a product with show_usd_chart = true
      const reqUserPost = new NextRequest('https://example.com/api/products', {
        method: 'POST',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${user1Cookie}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'کالای کاربر عادی',
          url: 'https://example.com/regular-item',
          is_public: true, // viewer attempts to make it public
          show_usd_chart: true, // viewer attempts to enable usd chart
        }),
      });
      const resUserPost = await postProduct(reqUserPost);
      expect(resUserPost.status).toBe(200);
      const { product_key: userItemKey } = await resUserPost.json();

      const db3 = getDatabase();
      const userProd = db3.prepare('SELECT is_public, show_usd_chart FROM managed_products WHERE key = ?').get(userItemKey) as any;
      expect(userProd.is_public).toBe(0);
      expect(userProd.show_usd_chart).toBe(0);
      db3.close();
    });
  });
});
