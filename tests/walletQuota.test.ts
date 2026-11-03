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
  getUserQuota,
  chargeUserWallet,
  purchaseProductSlot,
  getUserWalletTransactions,
  getSlotPriceToman,
  FREE_PRODUCT_LIMIT,
  isProductEligibleForCollection,
} from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { POST as postProduct } from '../src/app/api/products/route';
import { GET as getWallet } from '../src/app/api/user/wallet/route';
import { POST as buySlot } from '../src/app/api/user/wallet/buy-slot/route';
import { POST as adminChargeWallet } from '../src/app/api/admin/users/[id]/wallet/route';

describe('User Product Quota and Wallet Monetization', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let adminId: number;
  let viewerId: number;
  let adminCookie: string;
  let viewerCookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `wallet_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('password123');
    adminId = createUser(db, { username: 'admin', password_hash: hash, role: 'admin' }).id;
    viewerId = createUser(db, { username: 'viewer', password_hash: hash, role: 'viewer' }).id;

    adminCookie = await signAuthToken({ id: adminId, username: 'admin', role: 'admin' });
    viewerCookie = await signAuthToken({ id: viewerId, username: 'viewer', role: 'viewer' });

    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // Ignore unlink error
      }
    }
  });

  it('provides 3 free product slots by default to viewer users', () => {
    const db = getDatabase();
    const quota = getUserQuota(db, viewerId, false);
    expect(quota.freeLimit).toBe(3);
    expect(quota.extraSlots).toBe(0);
    expect(quota.totalLimit).toBe(3);
    expect(quota.usedCount).toBe(0);
    expect(quota.remaining).toBe(3);
    expect(quota.canAdd).toBe(true);
    db.close();
  });

  it('allows adding 3 products and blocks the 4th product for viewers', async () => {
    const db = getDatabase();

    // Add 3 products
    for (let i = 1; i <= 3; i++) {
      const res = addManagedProduct(db, {
        title: `Product ${i}`,
        url: `https://www.digikala.com/product/dkp-${1000 + i}`,
        user_id: viewerId,
      });
      expect(res.product_key).toBeDefined();
    }

    const quotaAfter3 = getUserQuota(db, viewerId, false);
    expect(quotaAfter3.usedCount).toBe(3);
    expect(quotaAfter3.remaining).toBe(0);
    expect(quotaAfter3.canAdd).toBe(false);

    // Attempting to add 4th product throws quota error
    expect(() => {
      addManagedProduct(db, {
        title: 'Product 4',
        url: 'https://www.digikala.com/product/dkp-1004',
        user_id: viewerId,
      });
    }).toThrow(/سقف ظرفیت محصولات شما/);

    db.close();
  });

  it('returns 403 quota_exceeded when adding 4th product via API', async () => {
    // Add 3 products via API
    for (let i = 1; i <= 3; i++) {
      const req = new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
        },
        body: JSON.stringify({
          title: `API Product ${i}`,
          url: `https://www.digikala.com/product/dkp-${2000 + i}`,
        }),
      });
      const res = await postProduct(req);
      expect(res.status).toBe(200);
    }

    // Attempt 4th product
    const req4 = new NextRequest('http://localhost:3000/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
      },
      body: JSON.stringify({
        title: 'API Product 4',
        url: 'https://www.digikala.com/product/dkp-2004',
      }),
    });
    const res4 = await postProduct(req4);
    expect(res4.status).toBe(403);
    const body4 = await res4.json();
    expect(body4.quota_exceeded).toBe(true);
  });

  it('allows admins to add unlimited products', () => {
    const db = getDatabase();
    for (let i = 1; i <= 5; i++) {
      const res = addManagedProduct(db, {
        title: `Admin Product ${i}`,
        url: `https://www.digikala.com/product/dkp-${3000 + i}`,
        user_id: adminId,
      });
      expect(res.product_key).toBeDefined();
    }
    db.close();
  });

  it('handles admin charging user wallet and user buying extra slots', async () => {
    // 1. Admin charges user wallet with 100,000 Tomans
    const adminReq = new NextRequest(`http://localhost:3000/api/admin/users/${viewerId}/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${AUTH_COOKIE_NAME}=${adminCookie}`,
      },
      body: JSON.stringify({
        amount: 100000,
        description: 'واریز دستی جهت خرید اسلات',
      }),
    });
    const chargeRes = await adminChargeWallet(adminReq, { params: Promise.resolve({ id: String(viewerId) }) });
    expect(chargeRes.status).toBe(200);
    const chargeData = await chargeRes.json();
    expect(chargeData.balance).toBe(100000);

    // 2. User checks wallet via API
    const walletReq = new NextRequest('http://localhost:3000/api/user/wallet', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}` },
    });
    const walletRes = await getWallet(walletReq);
    expect(walletRes.status).toBe(200);
    const walletData = await walletRes.json();
    expect(walletData.wallet_balance).toBe(100000);
    expect(walletData.transactions.length).toBe(1);
    expect(walletData.transactions[0].amount).toBe(100000);

    // 3. User buys 1 extra slot (50,000 Tomans)
    const buySlotReq = new NextRequest('http://localhost:3000/api/user/wallet/buy-slot', {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}` },
    });
    const buyRes = await buySlot(buySlotReq);
    expect(buyRes.status).toBe(200);
    const buyData = await buyRes.json();
    expect(buyData.extra_slots).toBe(1);
    expect(buyData.wallet_balance).toBe(50000);
    expect(buyData.quota.totalLimit).toBe(4);

    // 4. Now viewer can add 4 products in total!
    const db = getDatabase();
    for (let i = 1; i <= 4; i++) {
      addManagedProduct(db, {
        title: `Allowed Product ${i}`,
        url: `https://www.digikala.com/product/dkp-${4000 + i}`,
        user_id: viewerId,
      });
    }

    const quotaAfter4 = getUserQuota(db, viewerId, false);
    expect(quotaAfter4.usedCount).toBe(4);
    expect(quotaAfter4.remaining).toBe(0);
    expect(quotaAfter4.canAdd).toBe(false);

    db.close();
  });

  it('rejects buying slot if wallet balance is insufficient', async () => {
    const buySlotReq = new NextRequest('http://localhost:3000/api/user/wallet/buy-slot', {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}` },
    });
    const buyRes = await buySlot(buySlotReq);
    expect(buyRes.status).toBe(400);
    const buyData = await buyRes.json();
    expect(buyData.error).toContain('کافی نیست');
  });

  it('sets 30-day expiration date upon purchasing slot and creates user_subscriptions entry', async () => {
    const db = getDatabase();
    // Admin charges user wallet with 50,000
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });

    const purchaseRes = purchaseProductSlot(db, { userId: viewerId });
    expect(purchaseRes.extra_slots).toBe(1);
    expect(purchaseRes.slot_expires_at).toBeDefined();

    const expiryDate = new Date(purchaseRes.slot_expires_at);
    const now = new Date();
    const diffDays = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);

    const quota = getUserQuota(db, viewerId, false);
    expect(quota.extraSlots).toBe(1);
    expect(quota.isExpired).toBe(false);
    expect(quota.daysRemaining).toBe(30);

    // Verify subscription record was created
    const subs = db.prepare('SELECT * FROM user_subscriptions WHERE user_id = ?').all(viewerId) as any[];
    expect(subs.length).toBe(1);
    expect(subs[0].slots).toBe(1);
    expect(subs[0].duration_days).toBe(30);
    expect(subs[0].source_type).toBe('wallet_slot');
    expect(subs[0].status).toBe('active');

    db.close();
  });

  it('treats expired extra slots as 0 and flags isExpired when slot_expires_at is in the past', () => {
    const db = getDatabase();
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

    db.prepare('UPDATE users SET extra_slots = 5, slot_expires_at = ? WHERE id = ?').run(pastDate, viewerId);

    const quota = getUserQuota(db, viewerId, false);
    expect(quota.extraSlots).toBe(0);
    expect(quota.isExpired).toBe(true);
    expect(quota.daysRemaining).toBe(0);
    expect(quota.totalLimit).toBe(3); // Falls back to 3 free limit

    db.close();
  });

  it('pauses collection for excess products when user subscription expires', () => {
    const db = getDatabase();

    // User adds 4 products
    const p1 = addManagedProduct(db, { title: 'P1', url: 'https://digikala.com/p1', user_id: viewerId }).product_key;
    const p2 = addManagedProduct(db, { title: 'P2', url: 'https://digikala.com/p2', user_id: viewerId }).product_key;
    const p3 = addManagedProduct(db, { title: 'P3', url: 'https://digikala.com/p3', user_id: viewerId }).product_key;

    // Grant 1 extra slot valid in the future
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET extra_slots = 1, slot_expires_at = ? WHERE id = ?').run(futureDate, viewerId);

    const p4 = addManagedProduct(db, { title: 'P4', url: 'https://digikala.com/p4', user_id: viewerId }).product_key;

    // Both p1 (free) and p4 (extra) are eligible while subscription is active
    expect(isProductEligibleForCollection(db, p1)).toBe(true);
    expect(isProductEligibleForCollection(db, p4)).toBe(true);

    // Now simulate subscription expiration
    const pastDate = new Date(Date.now() - 1000).toISOString();
    db.prepare('UPDATE users SET slot_expires_at = ? WHERE id = ?').run(pastDate, viewerId);

    // p1, p2, p3 (first 3 free products) are still eligible
    expect(isProductEligibleForCollection(db, p1)).toBe(true);
    expect(isProductEligibleForCollection(db, p2)).toBe(true);
    expect(isProductEligibleForCollection(db, p3)).toBe(true);

    // p4 (excess product beyond free 3) is now ineligible / paused!
    expect(isProductEligibleForCollection(db, p4)).toBe(false);

    db.close();
  });
});
