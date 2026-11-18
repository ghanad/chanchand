import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  getDatabase,
  initDatabase,
  runMigrations,
  createUser,
  addManagedProduct,
  deleteManagedProduct,
  getUserQuota,
  getUserProductSlots,
  chargeUserWallet,
  purchaseProductSlot,
  hasHistoryGrant,
  recordHistoryGrant,
} from '../src/lib/db';
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME } from '../src/lib/auth';
import { POST as postProduct } from '../src/app/api/products/route';

describe('Per-product slots and one-time history grants', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;
  let viewerId: number;
  let viewerCookie: string;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `slots_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);
    const hash = await hashPassword('password123');
    viewerId = createUser(db, { username: 'viewer', password_hash: hash, role: 'viewer' }).id;
    viewerCookie = await signAuthToken({ id: viewerId, username: 'viewer', role: 'viewer' });
    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // ignore
      }
    }
  });

  it('lists each tracked product with its own slot kind', () => {
    const db = getDatabase();
    chargeUserWallet(db, { userId: viewerId, amount: 50000 });
    purchaseProductSlot(db, { userId: viewerId });

    for (let i = 1; i <= 3; i++) {
      addManagedProduct(db, {
        title: `Free ${i}`,
        url: `https://www.digikala.com/product/dkp-${8000 + i}`,
        user_id: viewerId,
      });
    }
    const paidKey = addManagedProduct(db, {
      title: 'Paid',
      url: 'https://www.digikala.com/product/dkp-8004',
      user_id: viewerId,
    }).product_key;

    const slots = getUserProductSlots(db, viewerId);
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.kind === 'free')).toHaveLength(3);
    const paid = slots.find((s) => s.product_key === paidKey);
    expect(paid?.kind).toBe('paid');
    expect(paid?.days_remaining).toBe(30);
    expect(paid?.expires_at).toBeTruthy();

    db.close();
  });

  it('records a history grant at most once per user and product', () => {
    const db = getDatabase();
    expect(hasHistoryGrant(db, viewerId, 'some-product')).toBe(false);
    recordHistoryGrant(db, viewerId, 'some-product');
    recordHistoryGrant(db, viewerId, 'some-product');
    expect(hasHistoryGrant(db, viewerId, 'some-product')).toBe(true);

    const count = db
      .prepare('SELECT COUNT(*) AS cnt FROM product_history_grants WHERE user_id = ? AND product_key = ?')
      .get(viewerId, 'some-product') as { cnt: number };
    expect(count.cnt).toBe(1);
    db.close();
  });

  it('does not hand out a second 30-day history import after delete + re-add', async () => {
    const addReq = () =>
      new NextRequest('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${viewerCookie}`,
        },
        body: JSON.stringify({
          title: 'Readd Product',
          url: 'https://www.digikala.com/product/dkp-9100',
        }),
      });

    const first = await postProduct(addReq());
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.history_backfill?.reason).not.toBe('already_granted');

    const db = getDatabase();
    deleteManagedProduct(db, firstBody.product_key, { id: viewerId, role: 'viewer' });
    db.close();

    const second = await postProduct(addReq());
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.history_backfill?.reason).toBe('already_granted');
    expect(secondBody.history_backfill?.inserted).toBe(0);
  });

  it('materialises the legacy shared pool into per-product windows', () => {
    const db = getDatabase();
    // Buy two credits so four products can be tracked, then rewind to the old
    // shared-pool representation.
    chargeUserWallet(db, { userId: viewerId, amount: 100000 });
    purchaseProductSlot(db, { userId: viewerId });
    purchaseProductSlot(db, { userId: viewerId });

    for (let i = 1; i <= 4; i++) {
      addManagedProduct(db, {
        title: `Legacy ${i}`,
        url: `https://www.digikala.com/product/dkp-${9000 + i}`,
        user_id: viewerId,
      });
    }
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE user_products SET slot_started_at = NULL, slot_expires_at = NULL WHERE user_id = ?').run(viewerId);
    db.prepare('UPDATE users SET extra_slots = 2, slot_expires_at = ? WHERE id = ?').run(future, viewerId);

    runMigrations(db);

    const rows = db
      .prepare('SELECT product_key, slot_expires_at FROM user_products WHERE user_id = ? ORDER BY id ASC')
      .all(viewerId) as Array<{ product_key: string; slot_expires_at: string | null }>;
    expect(rows).toHaveLength(4);
    // First three stay free, the fourth inherits the pool's expiry.
    expect(rows[0].slot_expires_at).toBeNull();
    expect(rows[1].slot_expires_at).toBeNull();
    expect(rows[2].slot_expires_at).toBeNull();
    expect(rows[3].slot_expires_at).toBe(future);

    const user = db.prepare('SELECT extra_slots, slot_expires_at FROM users WHERE id = ?').get(viewerId) as {
      extra_slots: number;
      slot_expires_at: string | null;
    };
    expect(user.extra_slots).toBe(1);
    expect(user.slot_expires_at).toBeNull();

    const quota = getUserQuota(db, viewerId, false);
    expect(quota.paidActive).toBe(1);
    expect(quota.freeUsed).toBe(3);
    expect(quota.extraSlots).toBe(1);
    expect(quota.remaining).toBe(1);

    db.close();
  });
});
