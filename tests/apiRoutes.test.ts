import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import { getDatabase, initDatabase, createUser, addManagedProduct } from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { GET as getHealth } from '../src/app/api/health/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { POST as postLogin } from '../src/app/api/auth/login/route';
import { GET as getProducts, POST as postProduct } from '../src/app/api/products/route';
import { GET as getIranjibItems } from '../src/app/api/sources/iranjib/items/route';

describe('Next.js API Route Handlers Integration', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `api_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);
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

  describe('GET /api/health', () => {
    it('returns status ok with timestamp', async () => {
      const res = await getHealth();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects missing credentials with 400', async () => {
      const req = new NextRequest('https://example.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '' }),
      });

      const res = await postLogin(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('الزامی است');
    });

    it('rejects invalid password with 401', async () => {
      const db = getDatabase();
      const hash = await hashPassword('correct_pass');
      createUser(db, {
        username: 'alice',
        password_hash: hash,
        role: 'viewer',
      });
      db.close();

      const req = new NextRequest('https://example.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'wrong_password' }),
      });

      const res = await postLogin(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('نادرست است');
    });

    it('logs in successfully and sets auth cookie', async () => {
      const db = getDatabase();
      const hash = await hashPassword('mypassword123');
      createUser(db, {
        username: 'bob',
        password_hash: hash,
        role: 'admin',
      });
      db.close();

      const req = new NextRequest('https://example.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'bob', password: 'mypassword123' }),
      });

      const res = await postLogin(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.username).toBe('bob');
      expect(json.user.role).toBe('admin');

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(AUTH_COOKIE_NAME);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = new NextRequest('https://example.com/api/auth/me');
      const res = await getMe(req);
      expect(res.status).toBe(401);
    });

    it('returns user profile when authenticated with valid token', async () => {
      const db = getDatabase();
      const hash = await hashPassword('password123');
      const user = createUser(db, {
        username: 'charlie',
        email: 'charlie@test.com',
        password_hash: hash,
        role: 'viewer',
      });
      db.close();

      const token = await signAuthToken({ id: user.id, username: 'charlie', role: 'viewer' });
      const req = new NextRequest('https://example.com/api/auth/me', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
      });

      const res = await getMe(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.user.id).toBe(user.id);
      expect(json.user.username).toBe('charlie');
      expect(json.user.email).toBe('charlie@test.com');
      expect(json.user.role).toBe('viewer');
    });
  });

  describe('GET /api/products', () => {
    it('returns products and sources list from database', async () => {
      const db = getDatabase();
      addManagedProduct(db, {
        title: 'گوشی آیفون ۱۵',
        url: 'https://www.digikala.com/product/dkp-15',
        source_key: 'digikala_api',
      });
      db.close();

      const req = new NextRequest('https://example.com/api/products');
      const res = await getProducts(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toBeDefined();
      expect(json.sources).toBeDefined();
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.some((p: any) => p.title === 'گوشی آیفون ۱۵')).toBe(true);
    });
  });

  describe('POST /api/products', () => {
    const chartPayload = {
      status: 200,
      data: {
        today: '2026-11-14',
        chart_selection_title: 'انتخاب رنگ',
        price_chart: [
          {
            id: 0,
            title: 'مشکی',
            history: [
              { day: '1405/08/21', selling_price: 1000000, rrp_price: 1100000, is_marketable: true, seller: 'فروشنده' },
              { day: '1405/08/22', selling_price: 1050000, rrp_price: 1100000, is_marketable: true, seller: 'فروشنده' },
            ],
          },
        ],
      },
    };

    function stubDigikalaFetch() {
      const calls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          calls.push(String(url));
          return new Response(JSON.stringify(chartPayload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        })
      );
      return calls;
    }

    it('seeds Digikala price history only when the product is new', async () => {
      const db = getDatabase();
      const user = createUser(db, {
        username: 'dave',
        password_hash: await hashPassword('secret123'),
        role: 'admin',
      });
      db.close();

      const token = await signAuthToken({ id: user.id, username: user.username, role: 'admin' });
      const calls = stubDigikalaFetch();

      const body = JSON.stringify({
        title: 'هدفون تست',
        url: 'https://www.digikala.com/product/dkp-424242/',
        source_key: 'digikala_api',
      });

      const first = await postProduct(
        new NextRequest('https://example.com/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `${AUTH_COOKIE_NAME}=${token}` },
          body,
        })
      );
      expect(first.status).toBe(200);
      const firstJson = await first.json();
      expect(firstJson.reused).toBe(false);
      expect(firstJson.history_backfill).toMatchObject({ inserted: 2, groups: 1 });
      expect(calls.filter((c) => c.includes('price-chart'))).toHaveLength(1);

      const dbAfter = getDatabase();
      const snapshots = dbAfter
        .prepare('SELECT COUNT(*) AS cnt FROM price_snapshots WHERE product_key = ?')
        .get(firstJson.product_key) as { cnt: number };
      dbAfter.close();
      expect(snapshots.cnt).toBe(2);

      // Adding the same URL again reuses the product and must not re-fetch.
      const second = await postProduct(
        new NextRequest('https://example.com/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `${AUTH_COOKIE_NAME}=${token}` },
          body,
        })
      );
      const secondJson = await second.json();
      expect(secondJson.reused).toBe(true);
      expect(secondJson.history_backfill).toBeUndefined();
      expect(calls.filter((c) => c.includes('price-chart'))).toHaveLength(1);

      vi.unstubAllGlobals();
    });
  });

  describe('GET /api/sources/iranjib/items', () => {
    it('returns 401 if unauthenticated', async () => {
      const req = new NextRequest('https://example.com/api/sources/iranjib/items');
      const res = await getIranjibItems(req);
      expect(res.status).toBe(401);
    });

    it('returns car catalog and companies for authenticated user', async () => {
      const token = await signAuthToken({ id: 1, username: 'testuser', role: 'admin' });
      const req = new NextRequest('https://example.com/api/sources/iranjib/items', {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${token}` },
      });
      const res = await getIranjibItems(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThan(0);
      expect(Array.isArray(json.companies)).toBe(true);
      expect(json.companies).toContain('ایران خودرو');
    });
  });
});
