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
  startRun,
  finishRun,
  recordPrice,
  recordError,
  getCronRuns,
  getCronRunStats,
  getRunDetails,
} from '../src/lib/db';
import { signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/jwt';
import { GET as cronRunsGet } from '../src/app/api/admin/cron-runs/route';
import { GET as cronRunDetailGet } from '../src/app/api/admin/cron-runs/[id]/route';
import { POST as cronRunTestPost } from '../src/app/api/admin/cron-runs/test/route';
import { POST as triggerRunPost } from '../src/app/api/trigger-run/route';
import { releaseRunLock } from '../src/lib/run-lock';

describe('Admin Cron & API Runs Feature', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let prevApiKeyEnv: string | undefined;
  const TEST_API_KEY = 'cron-secret-key-999';

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    prevApiKeyEnv = process.env.TRIGGER_API_KEY;

    process.env.TRIGGER_API_KEY = TEST_API_KEY;
    const tmpName = `cron_admin_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const admin = createUser(db, {
      username: 'admin',
      password_hash: 'dummy-hash',
      role: 'admin',
      email: null,
    });

    createUser(db, {
      username: 'viewer',
      password_hash: 'dummy-hash',
      role: 'viewer',
      email: null,
    });

    addManagedSource(db, {
      key: 'mock_src',
      adapter: 'generic_html',
      rate_limit_seconds: 0,
      price_multiplier: 1,
      currency: 'IRR',
    });

    addManagedProduct(db, {
      title: 'Cron Test Product',
      url: 'https://example.com/test',
      source_key: 'mock_src',
      user_id: admin.id,
      is_public: true,
      adapter_settings: { selector: '.val' },
    });

    releaseRunLock();
  });

  afterEach(() => {
    releaseRunLock();
    if (prevDbEnv !== undefined) {
      process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    } else {
      delete process.env.PRICE_GETTER_DB_URL;
    }
    if (prevApiKeyEnv !== undefined) {
      process.env.TRIGGER_API_KEY = prevApiKeyEnv;
    } else {
      delete process.env.TRIGGER_API_KEY;
    }
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  it('stores and queries trigger_source and trigger_details correctly in SQLite', () => {
    const db = getDatabase();

    const runId1 = startRun(db, null, null, undefined, undefined, 'cron', {
      user_agent: 'curl/8.7.1',
      schedule: '0 * * * *',
    });
    finishRun(db, runId1, 2, 0, 2);

    const runId2 = startRun(db, null, null, undefined, undefined, 'api', {
      client: 'external_webhook',
    });
    finishRun(db, runId2, 0, 2, 2);

    const cronRuns = getCronRuns(db, 10, 'all');
    expect(cronRuns.length).toBeGreaterThanOrEqual(2);

    const r1 = cronRuns.find((r) => r.id === runId1);
    expect(r1).toBeDefined();
    expect(r1?.trigger_source).toBe('cron');
    expect(r1?.trigger_details).toContain('curl/8.7.1');
    expect(r1?.status).toBe('success');

    const r2 = cronRuns.find((r) => r.id === runId2);
    expect(r2).toBeDefined();
    expect(r2?.trigger_source).toBe('api');
    expect(r2?.status).toBe('failed');

    const stats = getCronRunStats(db);
    expect(stats.cron_configured).toBe(true);
    expect(stats.total_runs_24h).toBe(2);
    expect(stats.success_runs_24h).toBe(1);
    expect(stats.error_runs_24h).toBe(1);
  });

  it('GET /api/admin/cron-runs denies access to viewers and returns stats to admins', async () => {
    // 1. Unauthenticated request
    const unauthReq = new NextRequest('https://example.com/api/admin/cron-runs');
    const unauthRes = await cronRunsGet(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Viewer request
    const viewerToken = await signAuthToken({ id: 2, username: 'viewer', role: 'viewer' });
    const viewerReq = new NextRequest('https://example.com/api/admin/cron-runs', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerToken}` },
    });
    const viewerRes = await cronRunsGet(viewerReq);
    expect(viewerRes.status).toBe(403);

    // 3. Admin request
    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const adminReq = new NextRequest('https://example.com/api/admin/cron-runs', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });
    const adminRes = await cronRunsGet(adminReq);
    expect(adminRes.status).toBe(200);

    const body = await adminRes.json();
    expect(body.stats).toBeDefined();
    expect(body.stats.cron_configured).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('GET /api/admin/cron-runs/[id] returns detailed snapshots and errors for a run', async () => {
    const db = getDatabase();
    const runId = startRun(db, null, null, undefined, undefined, 'cron', { job: 'hourly' });

    recordPrice(
      db,
      runId,
      {
        product_key: 'test_prod',
        source_key: 'mock_src',
        url: 'https://example.com/item',
        enabled: true,
      },
      {
        title: 'Item Title',
        seller: 'Store A',
        price_irr: 5000000,
        availability: 'in_stock',
        raw_observation: { price: 500000 },
      }
    );

    recordError(
      db,
      runId,
      {
        product_key: 'test_prod_err',
        source_key: 'mock_src',
        url: 'https://example.com/err',
        enabled: true,
      },
      new Error('Internal server error')
    );

    finishRun(db, runId, 1, 1, 2);

    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const req = new NextRequest(`https://example.com/api/admin/cron-runs/${runId}`, {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });

    const res = await cronRunDetailGet(req, { params: Promise.resolve({ id: String(runId) }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.run.id).toBe(runId);
    expect(body.run.trigger_source).toBe('cron');
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].price_toman).toBe(500000);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error_type).toBe('Error');
    expect(body.errors[0].message).toBe('Internal server error');
  });

  it('/api/trigger-run defaults trigger_source to "cron" for API key calls and allows custom source', async () => {
    const db = getDatabase();

    // Default trigger run via API Key
    const req1 = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
      },
    });
    const res1 = await triggerRunPost(req1);
    const body1 = await res1.json();
    expect(body1.ok).toBe(true);
    expect(body1.trigger_source).toBe('cron');

    const runDetails1 = getRunDetails(db, body1.run_id);
    expect(runDetails1?.run.trigger_source).toBe('cron');

    // Trigger run with explicit source="api"
    const req2 = new NextRequest('https://example.com/api/trigger-run', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ source: 'api' }),
    });
    const res2 = await triggerRunPost(req2);
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.trigger_source).toBe('api');

    const runDetails2 = getRunDetails(db, body2.run_id);
    expect(runDetails2?.run.trigger_source).toBe('api');
  });

  it('POST /api/admin/cron-runs/test triggers test run successfully for admin', async () => {
    const adminToken = await signAuthToken({ id: 1, username: 'admin', role: 'admin' });
    const req = new NextRequest('https://example.com/api/admin/cron-runs/test', {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${adminToken}` },
    });

    const res = await cronRunTestPost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.trigger_source).toBe('api');
    expect(body.run_id).toBeDefined();

    const db = getDatabase();
    const details = getRunDetails(db, body.run_id);
    expect(details?.run.trigger_source).toBe('api');
    expect(details?.run.trigger_details).toContain('اجرای تست ادمین');
  });
});
