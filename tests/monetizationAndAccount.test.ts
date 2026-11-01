import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';
import {
  getDatabase,
  initDatabase,
  createUser,
  getUserById,
  getUserQuota,
  addManagedProduct,
  deleteManagedProduct,
  getActivePackages,
  getPackageById,
  createPaymentTransaction,
  getPaymentTransactionByAuthority,
  markPaymentTransactionPaid,
  getUserPaymentTransactions,
} from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { getPaymentGateway, MockPaymentGateway, ZarinpalPaymentGateway } from '../src/lib/payment';
import { POST as postProduct } from '../src/app/api/products/route';
import { GET as getPackages } from '../src/app/api/packages/route';
import { POST as requestPayment } from '../src/app/api/payments/request/route';
import { GET as callbackPayment } from '../src/app/api/payments/callback/route';
import { GET as getPaymentsList } from '../src/app/api/payments/route';
import { PATCH as updateProfile } from '../src/app/api/user/profile/route';

describe('Monetization, Quota and Account System', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let viewerId: number;
  let viewerCookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `monetization_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;
    process.env.PAYMENT_GATEWAY = 'mock';

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('password123');
    const viewer = createUser(db, {
      username: 'testuser',
      email: 'test@example.com',
      mobile: '09123456789',
      password_hash: hash,
      role: 'viewer',
    });
    viewerId = viewer.id;
    viewerCookie = await signAuthToken({ id: viewerId, username: 'testuser', role: 'viewer' });

    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    delete process.env.PAYMENT_GATEWAY;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // Ignore unlink error
      }
    }
  });

  it('seeds default packages on init and provides getActivePackages', () => {
    const db = getDatabase();
    const packages = getActivePackages(db);
    expect(packages.length).toBeGreaterThanOrEqual(3);
    expect(packages.some((p) => p.key === 'pkg_5' && p.slots === 5 && p.price_toman === 75000)).toBe(true);
    expect(packages.some((p) => p.key === 'pkg_10' && p.slots === 10 && p.price_toman === 140000)).toBe(true);
    expect(packages.some((p) => p.key === 'pkg_25' && p.slots === 25 && p.price_toman === 300000)).toBe(true);
    db.close();
  });

  it('exposes packages via GET /api/packages endpoint', async () => {
    const req = new NextRequest('http://localhost:3000/api/packages', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}` },
    });
    const res = await getPackages(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.packages)).toBe(true);
    expect(data.packages.length).toBeGreaterThanOrEqual(3);
  });

  it('enforces 3 free slots, blocks 4th product with QUOTA_EXCEEDED error code, and frees slot on deletion', async () => {
    // 1. Add 3 products
    for (let i = 1; i <= 3; i++) {
      const req = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
        },
        body: JSON.stringify({
          title: `Product ${i}`,
          url: `https://www.digikala.com/product/dkp-100${i}`,
        }),
      });
      const res = await postProduct(req);
      expect(res.status).toBe(200);
    }

    // 2. Attempt to add 4th product -> Should return 403 with QUOTA_EXCEEDED code
    const req4 = new NextRequest('http://localhost:3000/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({
        title: 'Product 4',
        url: 'https://www.digikala.com/product/dkp-1004',
      }),
    });
    const res4 = await postProduct(req4);
    expect(res4.status).toBe(403);
    const body4 = await res4.json();
    expect(body4.code).toBe('QUOTA_EXCEEDED');
    expect(body4.quota_exceeded).toBe(true);

    // 3. Delete one product -> quota should be freed!
    const db = getDatabase();
    deleteManagedProduct(db, 'product-1', { id: viewerId, role: 'viewer' });
    const quotaAfterDelete = getUserQuota(db, viewerId, false);
    expect(quotaAfterDelete.usedCount).toBe(2);
    expect(quotaAfterDelete.remaining).toBe(1);
    expect(quotaAfterDelete.canAdd).toBe(true);

    // 4. Now adding product 4 succeeds!
    const req4Retry = new NextRequest('http://localhost:3000/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({
        title: 'Product 4',
        url: 'https://www.digikala.com/product/dkp-1004',
      }),
    });
    const res4Retry = await postProduct(req4Retry);
    expect(res4Retry.status).toBe(200);

    db.close();
  });

  it('initiates payment request and redirects to gateway', async () => {
    const db = getDatabase();
    const pkg = getActivePackages(db)[0];
    db.close();

    const req = new NextRequest('http://localhost:3000/api/payments/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({ packageId: pkg.id }),
    });

    const res = await requestPayment(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.transactionId).toBeDefined();
    expect(data.authority).toBeDefined();
    expect(data.gatewayUrl).toContain('Authority=');

    const db2 = getDatabase();
    const txn = getPaymentTransactionByAuthority(db2, data.authority);
    expect(txn).toBeDefined();
    expect(txn?.status).toBe('pending');
    expect(txn?.slots).toBe(pkg.slots);
    expect(txn?.amount_toman).toBe(pkg.price_toman);
    db2.close();
  });

  it('handles callback, verifies payment, and is strictly idempotent', async () => {
    const db = getDatabase();
    const pkg = getActivePackages(db)[1]; // e.g. 10 slots
    db.close();

    // 1. Request payment
    const req = new NextRequest('http://localhost:3000/api/payments/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({ packageId: pkg.id }),
    });
    const payRes = await requestPayment(req);
    const payData = await payRes.json();
    const authority = payData.authority;

    // 2. Simulate gateway callback
    const callbackReq = new NextRequest(
      `http://localhost:3000/api/payments/callback?Authority=${authority}&Status=OK`
    );
    const callbackRes = await callbackPayment(callbackReq);
    expect(callbackRes.status).toBe(307); // Redirect to /account
    const redirectLocation = callbackRes.headers.get('location') || '';
    expect(redirectLocation).toContain('/account');
    expect(redirectLocation).toContain('payment_status=success');

    // Verify user slots increased
    const db2 = getDatabase();
    const userAfter = getUserById(db2, viewerId);
    expect(userAfter?.extra_slots).toBe(pkg.slots);
    const quota = getUserQuota(db2, viewerId, false);
    expect(quota.totalLimit).toBe(3 + pkg.slots);

    const txn = getPaymentTransactionByAuthority(db2, authority);
    expect(txn?.status).toBe('paid');
    expect(txn?.ref_id).toBeDefined();

    // 3. IDEMPOTENCY: Call callback a second time with the exact same authority
    const secondCallback = await callbackPayment(callbackReq);
    expect(secondCallback.status).toBe(307);
    const secondRedirect = secondCallback.headers.get('location') || '';
    expect(secondRedirect).toContain('payment_status=success');

    // Slots must NOT have been doubled!
    const userAfterSecond = getUserById(db2, viewerId);
    expect(userAfterSecond?.extra_slots).toBe(pkg.slots);

    db2.close();
  });

  it('marks transaction failed when user cancels or gateway fails', async () => {
    const db = getDatabase();
    const pkg = getActivePackages(db)[0];
    db.close();

    // Request payment
    const req = new NextRequest('http://localhost:3000/api/payments/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({ packageId: pkg.id }),
    });
    const payRes = await requestPayment(req);
    const payData = await payRes.json();
    const authority = payData.authority;

    // Simulate callback with Status=NOK
    const callbackReq = new NextRequest(
      `http://localhost:3000/api/payments/callback?Authority=${authority}&Status=NOK`
    );
    const callbackRes = await callbackPayment(callbackReq);
    expect(callbackRes.status).toBe(307);
    const redirectLocation = callbackRes.headers.get('location') || '';
    expect(redirectLocation).toContain('payment_status=failed');

    const db2 = getDatabase();
    const txn = getPaymentTransactionByAuthority(db2, authority);
    expect(txn?.status).toBe('failed');
    const user = getUserById(db2, viewerId);
    expect(user?.extra_slots).toBe(0); // No slots granted
    db2.close();
  });

  it('lists past transactions via GET /api/payments', async () => {
    const db = getDatabase();
    createPaymentTransaction(db, {
      user_id: viewerId,
      package_id: 1,
      package_title: 'بسته ۱۰ تایی محصول',
      slots: 10,
      amount_toman: 140000,
      gateway: 'mock',
    });
    db.close();

    const req = new NextRequest('http://localhost:3000/api/payments', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}` },
    });
    const res = await getPaymentsList(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.transactions)).toBe(true);
    expect(data.transactions.length).toBe(1);
    expect(data.transactions[0].amount_toman).toBe(140000);
  });

  it('updates email and mobile via PATCH /api/user/profile', async () => {
    const req = new NextRequest('http://localhost:3000/api/user/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({
        email: 'updated@example.com',
        mobile: '09351112233',
      }),
    });

    const res = await updateProfile(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('updated@example.com');
    expect(data.user.mobile).toBe('09351112233');

    const db = getDatabase();
    const user = getUserById(db, viewerId);
    expect(user?.email).toBe('updated@example.com');
    expect(user?.mobile).toBe('09351112233');
    db.close();
  });

  it('instantiates pluggable gateways (Zarinpal and Mock)', () => {
    const mockGw = getPaymentGateway('mock');
    expect(mockGw.name).toBe('mock');

    const zarinpalGw = getPaymentGateway('zarinpal');
    expect(zarinpalGw.name).toBe('zarinpal');
  });
});
