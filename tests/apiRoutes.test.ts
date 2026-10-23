import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import { getDatabase, initDatabase, createUser, addManagedProduct } from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { GET as getHealth } from '../src/app/api/health/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { POST as postLogin } from '../src/app/api/auth/login/route';
import { GET as getProducts } from '../src/app/api/products/route';

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

      const res = await getProducts();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toBeDefined();
      expect(json.sources).toBeDefined();
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.some((p: any) => p.title === 'گوشی آیفون ۱۵')).toBe(true);
    });
  });
});
