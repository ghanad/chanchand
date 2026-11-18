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
  deleteManagedProduct,
  renewProductSlot,
  transferProductSlot,
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

  it('grants an unbound slot credit on purchase and starts the window when a product is added', () => {
    const db = getDatabase();
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });

    const purchaseRes = purchaseProductSlot(db, { userId: viewerId });
    expect(purchaseRes.extra_slots).toBe(1);
    // A purchase no longer carries an expiry: days start when a product uses it.
    expect(purchaseRes.slot_expires_at).toBeNull();

    const quota = getUserQuota(db, viewerId, false);
    expect(quota.extraSlots).toBe(1);
    expect(quota.remaining).toBe(4);
    expect(quota.paidActive).toBe(0);
    expect(quota.daysRemaining).toBeNull();

    // Verify the purchase record was created with one unused credit
    const subs = db.prepare('SELECT * FROM user_subscriptions WHERE user_id = ?').all(viewerId) as any[];
    expect(subs.length).toBe(1);
    expect(subs[0].slots).toBe(1);
    expect(subs[0].remaining_slots).toBe(1);
    expect(subs[0].duration_days).toBe(30);
    expect(subs[0].source_type).toBe('wallet_slot');
    expect(subs[0].status).toBe('active');

    // Fill the three free slots, then a fourth product consumes the credit.
    for (let i = 1; i <= 3; i++) {
      addManagedProduct(db, {
        title: `Free ${i}`,
        url: `https://www.digikala.com/product/dkp-${7000 + i}`,
        user_id: viewerId,
      });
    }
    const paidKey = addManagedProduct(db, {
      title: 'Paid',
      url: 'https://www.digikala.com/product/dkp-7004',
      user_id: viewerId,
    }).product_key;

    const row = db
      .prepare('SELECT slot_started_at, slot_expires_at FROM user_products WHERE user_id = ? AND product_key = ?')
      .get(viewerId, paidKey) as { slot_started_at: string; slot_expires_at: string };
    expect(row.slot_started_at).toBeTruthy();
    const diffDays = Math.round((new Date(row.slot_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);

    const quotaAfter = getUserQuota(db, viewerId, false);
    expect(quotaAfter.extraSlots).toBe(0);
    expect(quotaAfter.paidActive).toBe(1);
    expect(quotaAfter.daysRemaining).toBe(30);
    expect(quotaAfter.usedCount).toBe(4);

    const subsAfter = db.prepare('SELECT remaining_slots FROM user_subscriptions WHERE user_id = ?').all(viewerId) as any[];
    expect(subsAfter[0].remaining_slots).toBe(0);

    db.close();
  });

  it('deleting a paid product does not refund its remaining days', () => {
    const db = getDatabase();
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });

    for (let i = 1; i <= 3; i++) {
      addManagedProduct(db, {
        title: `Free ${i}`,
        url: `https://www.digikala.com/product/dkp-${7100 + i}`,
        user_id: viewerId,
      });
    }
    const paidKey = addManagedProduct(db, {
      title: 'Paid',
      url: 'https://www.digikala.com/product/dkp-7104',
      user_id: viewerId,
    }).product_key;

    deleteManagedProduct(db, paidKey, { id: viewerId, role: 'viewer' });

    const quota = getUserQuota(db, viewerId, false);
    // The credit was consumed; deleting the product must not hand it back.
    expect(quota.extraSlots).toBe(0);
    expect(quota.remaining).toBe(0);
    expect(quota.canAdd).toBe(false);

    db.close();
  });

  it('reports a lapsed paid slot and pauses collection for that product only', () => {
    const db = getDatabase();
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });

    const freeKeys: string[] = [];
    for (let i = 1; i <= 3; i++) {
      freeKeys.push(
        addManagedProduct(db, {
          title: `Free ${i}`,
          url: `https://www.digikala.com/product/dkp-${7200 + i}`,
          user_id: viewerId,
        }).product_key
      );
    }
    const paidKey = addManagedProduct(db, {
      title: 'Paid',
      url: 'https://www.digikala.com/product/dkp-7204',
      user_id: viewerId,
    }).product_key;

    for (const key of [...freeKeys, paidKey]) {
      expect(isProductEligibleForCollection(db, key)).toBe(true);
    }

    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE user_products SET slot_expires_at = ? WHERE user_id = ? AND product_key = ?').run(
      pastDate,
      viewerId,
      paidKey
    );

    const quota = getUserQuota(db, viewerId, false);
    expect(quota.isExpired).toBe(true);
    expect(quota.paidExpired).toBe(1);
    expect(quota.paidActive).toBe(0);
    expect(quota.extraSlots).toBe(0);
    expect(quota.totalLimit).toBe(3);

    for (const key of freeKeys) {
      expect(isProductEligibleForCollection(db, key)).toBe(true);
    }
    expect(isProductEligibleForCollection(db, paidKey)).toBe(false);

    // Renewing with a fresh credit re-opens the window.
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });
    renewProductSlot(db, viewerId, paidKey);

    expect(isProductEligibleForCollection(db, paidKey)).toBe(true);
    const renewed = getUserQuota(db, viewerId, false);
    expect(renewed.paidActive).toBe(1);
    expect(renewed.isExpired).toBe(false);

    db.close();
  });

  it('transfers a remaining window once and refuses a second transfer', () => {
    const db = getDatabase();
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });

    for (let i = 1; i <= 3; i++) {
      addManagedProduct(db, {
        title: `Free ${i}`,
        url: `https://www.digikala.com/product/dkp-${7300 + i}`,
        user_id: viewerId,
      });
    }
    const fromKey = addManagedProduct(db, {
      title: 'From',
      url: 'https://www.digikala.com/product/dkp-7304',
      user_id: viewerId,
    }).product_key;

    // A second paid product would need another credit; add it while the credit
    // pool still has one, then move the first window onto it.
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });
    const toKey = addManagedProduct(db, {
      title: 'To',
      url: 'https://www.digikala.com/product/dkp-7305',
      user_id: viewerId,
    }).product_key;

    // Simulate the destination slot having lapsed, then move the window onto it.
    db.prepare('UPDATE user_products SET slot_expires_at = ? WHERE user_id = ? AND product_key = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      viewerId,
      toKey
    );

    const result = transferProductSlot(db, viewerId, fromKey, toKey);
    expect(result.to).toBe(toKey);

    const toRow = db
      .prepare('SELECT slot_expires_at FROM user_products WHERE user_id = ? AND product_key = ?')
      .get(viewerId, toKey) as { slot_expires_at: string };
    expect(new Date(toRow.slot_expires_at).getTime()).toBeGreaterThan(Date.now());

    expect(() => transferProductSlot(db, viewerId, fromKey, toKey)).toThrow(/منتقل شده/);

    db.close();
  });
});
