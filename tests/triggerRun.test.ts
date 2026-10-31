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
  addManagedSource,
} from '../src/lib/db';
import { signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/jwt';
import { POST as triggerRunPost, GET as triggerRunGet } from '../src/app/api/trigger-run/route';
import { middleware } from '../src/middleware';
import { acquireRunLock, releaseRunLock } from '../src/lib/run-lock';

describe('POST /api/trigger-run (OS Cron & Scheduler API)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let prevApiKeyEnv: string | undefined;
  const TEST_API_KEY = 'secret-test-cron-token-12345';

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    prevApiKeyEnv = process.env.TRIGGER_API_KEY;

    process.env.TRIGGER_API_KEY = TEST_API_KEY;
    const tmpName = `trigger_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const user = createUser(db, {
      username: 'admin',
      password_hash: 'dummy-hash',
      role: 'admin',
      email: null,
    });

    // Setup dummy source, product, and target
    addManagedSource(db, {
      key: 'test_mock_source',
      adapter: 'generic_html',
      rate_limit_seconds: 0,
      price_multiplier: 1,
      currency: 'IRR',
    });

    addManagedProduct(db, {
      title: 'Test Product',
      url: 'https://example.com/item/1',
      source_key: 'test_mock_source',
      user_id: user.id,
      is_public: true,
      adapter_settings: { selector: '.price' },
    });

    db.close();
    releaseRunLock();
  });

  afterEach(() => {
    releaseRunLock();
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    process.env.TRIGGER_API_KEY = prevApiKeyEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  it('rejects unauthenticated requests with 401 when no token or cookie is provided', async () => {
    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('کلید احراز هویت');
  });

  it('rejects requests with an incorrect API key with 401', async () => {
    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-key',
      },
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(401);
  });

  it('allows access via Authorization: Bearer <TRIGGER_API_KEY>', async () => {
    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run_id).toBeDefined();
    expect(json.duration_ms).toBeGreaterThanOrEqual(0);
    expect(json.target_count).toBe(1);
    expect(json.status).toBeDefined();
  });

  it('allows access via x-api-key header', async () => {
    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run_id).toBeDefined();
  });

  it('allows access via ?key query parameter in GET request', async () => {
    const req = new NextRequest(`https://example.com/api/trigger-run?key=${TEST_API_KEY}`, {
      method: 'GET',
    });

    const res = await triggerRunGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run_id).toBeDefined();
  });

  it('allows access for logged in admin users via session cookie', async () => {
    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
      },
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 409 Conflict when a run is already active', async () => {
    acquireRunLock(999, 10);

    const req = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    const res = await triggerRunPost(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('در حال حاضر در حال اجراست');
    expect(json.active_run_id).toBe(999);
  });

  it('middleware passes /api/trigger-run through without redirecting to login', async () => {
    const req = new NextRequest('https://example.com/api/trigger-run');
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
