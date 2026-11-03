import Database from 'better-sqlite3';
import {
  PackageRow,
  PaymentTransactionRow,
  UserQuota,
  UserSubscriptionRow,
  WalletTransactionRow,
} from '../types';
import { getSlotPriceToman } from './connection';
import { getUserById, getUserQuota } from './users';

export function chargeUserWallet(
  db: Database.Database,
  params: {
    userId: number;
    amount: number;
    description?: string;
    type?: 'admin_charge' | 'admin_adjustment';
  }
): { balance: number; transaction: WalletTransactionRow } {
  const { userId, amount, description, type = 'admin_charge' } = params;
  if (!amount || isNaN(amount)) {
    throw new Error('مبلغ شارژ نامعتبر است.');
  }

  const txn = db.transaction(() => {
    const user = getUserById(db, userId);
    if (!user) {
      throw new Error(`کاربر با شناسه ${userId} یافت نشد.`);
    }

    const currentBalance = user.wallet_balance || 0;
    const newBalance = currentBalance + amount;
    if (newBalance < 0) {
      throw new Error('موجودی کیف پول نمی‌تواند منفی شود.');
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET wallet_balance = ?, updated_at = ? WHERE id = ?').run(newBalance, now, userId);

    const desc = description || (amount >= 0 ? `شارژ کیف پول توسط مدیر سیستم` : `کسر از کیف پول توسط مدیر سیستم`);
    const insertTxn = db.prepare(`
      INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const res = insertTxn.run(userId, amount, newBalance, type, desc, now);

    return {
      balance: newBalance,
      transaction: {
        id: Number(res.lastInsertRowid),
        user_id: userId,
        amount,
        balance_after: newBalance,
        type,
        description: desc,
        created_at: now,
      },
    };
  });

  return txn();
}

export function purchaseProductSlot(
  db: Database.Database,
  params: {
    userId: number;
    slotPrice?: number;
    durationDays?: number;
  }
): { extra_slots: number; slot_expires_at: string; wallet_balance: number; transaction: WalletTransactionRow; quota: UserQuota } {
  const price = params.slotPrice ?? getSlotPriceToman();
  if (price <= 0) {
    throw new Error('قیمت اسلات نامعتبر است.');
  }
  const durationDays = params.durationDays ?? 30;

  const txn = db.transaction(() => {
    const user = getUserById(db, params.userId);
    if (!user) {
      throw new Error(`کاربر یافت نشد.`);
    }

    const currentBalance = user.wallet_balance || 0;
    if (currentBalance < price) {
      throw new Error(
        `موجودی کیف پول شما (${currentBalance.toLocaleString('fa-IR')} تومان) برای شارژ ماهانه اسلات (${price.toLocaleString('fa-IR')} تومان) کافی نیست.`
      );
    }

    const newBalance = currentBalance - price;
    const now = new Date();
    const nowIso = now.toISOString();

    let newExpiry: Date;
    let newSlots = 1;

    if (user.slot_expires_at && new Date(user.slot_expires_at).getTime() > now.getTime() && (user.extra_slots || 0) > 0) {
      newSlots = (user.extra_slots || 0) + 1;
      const currentExpiry = new Date(user.slot_expires_at);
      newExpiry = new Date(Math.max(currentExpiry.getTime(), now.getTime() + durationDays * 24 * 60 * 60 * 1000));
    } else {
      newSlots = 1;
      newExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    const newExpiryIso = newExpiry.toISOString();

    db.prepare(`
      UPDATE users
      SET wallet_balance = ?, extra_slots = ?, slot_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newBalance, newSlots, newExpiryIso, nowIso, params.userId);

    const desc = `شارژ ماهانه ۱ اسلات ظرفیت پایش محصول (${durationDays} روزه)`;
    const insertTxn = db.prepare(`
      INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description, created_at)
      VALUES (?, ?, ?, 'slot_purchase', ?, ?)
    `);
    const res = insertTxn.run(params.userId, -price, newBalance, desc, nowIso);

    // Record subscription
    db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, slots, price_toman, duration_days, source_type,
        starts_at, expires_at, status, created_at
      ) VALUES (?, ?, ?, ?, 'wallet_slot', ?, ?, 'active', ?)
    `).run(params.userId, 1, price, durationDays, nowIso, newExpiryIso, nowIso);

    const transaction: WalletTransactionRow = {
      id: Number(res.lastInsertRowid),
      user_id: params.userId,
      amount: -price,
      balance_after: newBalance,
      type: 'slot_purchase',
      description: desc,
      created_at: nowIso,
    };

    const quota = getUserQuota(db, params.userId, user.role === 'admin');

    return {
      extra_slots: newSlots,
      slot_expires_at: newExpiryIso,
      wallet_balance: newBalance,
      transaction,
      quota,
    };
  });

  return txn();
}

export function getUserWalletTransactions(
  db: Database.Database,
  userId: number,
  limit = 20
): WalletTransactionRow[] {
  return db
    .prepare(`
      SELECT id, user_id, amount, balance_after, type, description, created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(userId, limit) as WalletTransactionRow[];
}

export function getActivePackages(db: Database.Database): PackageRow[] {
  return db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY slots ASC').all() as PackageRow[];
}

export function getPackageById(db: Database.Database, id: number): PackageRow | null {
  const row = db.prepare('SELECT * FROM packages WHERE id = ?').get(id) as PackageRow | undefined;
  return row ?? null;
}

export function getPackageByKey(db: Database.Database, key: string): PackageRow | null {
  const row = db.prepare('SELECT * FROM packages WHERE key = ?').get(key) as PackageRow | undefined;
  return row ?? null;
}

export function createPaymentTransaction(
  db: Database.Database,
  params: {
    user_id: number;
    package_id: number | null;
    package_title: string;
    slots: number;
    amount_toman: number;
    gateway: string;
    authority?: string | null;
    meta?: any;
  }
): PaymentTransactionRow {
  const now = new Date().toISOString();
  const metaStr = params.meta ? (typeof params.meta === 'string' ? params.meta : JSON.stringify(params.meta)) : '{}';
  const stmt = db.prepare(`
    INSERT INTO payment_transactions (user_id, package_id, package_title, slots, amount_toman, gateway, authority, status, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  const result = stmt.run(
    params.user_id,
    params.package_id,
    params.package_title,
    params.slots,
    params.amount_toman,
    params.gateway,
    params.authority || null,
    metaStr,
    now,
    now
  );
  const id = Number(result.lastInsertRowid);
  return getPaymentTransactionById(db, id)!;
}

export function updatePaymentTransactionAuthority(
  db: Database.Database,
  id: number,
  authority: string,
  meta?: any
): void {
  const now = new Date().toISOString();
  if (meta) {
    const metaStr = typeof meta === 'string' ? meta : JSON.stringify(meta);
    db.prepare('UPDATE payment_transactions SET authority = ?, meta = ?, updated_at = ? WHERE id = ?').run(authority, metaStr, now, id);
  } else {
    db.prepare('UPDATE payment_transactions SET authority = ?, updated_at = ? WHERE id = ?').run(authority, now, id);
  }
}

export function getPaymentTransactionById(db: Database.Database, id: number): PaymentTransactionRow | null {
  const row = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
  return row ?? null;
}

export function getPaymentTransactionByAuthority(db: Database.Database, authority: string): PaymentTransactionRow | null {
  const row = db.prepare('SELECT * FROM payment_transactions WHERE authority = ?').get(authority) as PaymentTransactionRow | undefined;
  return row ?? null;
}

export function markPaymentTransactionPaid(
  db: Database.Database,
  id: number,
  refId: string,
  meta?: any
): { success: boolean; alreadyPaid: boolean; extraSlots: number; slotExpiresAt?: string } {
  const txn = db.transaction(() => {
    const current = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
    if (!current) {
      throw new Error(`تراکنش با شناسه ${id} یافت نشد.`);
    }

    const user = getUserById(db, current.user_id);
    if (!user) {
      throw new Error(`کاربر صاحب تراکنش با شناسه ${current.user_id} یافت نشد.`);
    }

    // Idempotency: if already marked paid, return safely without granting slots again
    if (current.status === 'paid') {
      return { success: true, alreadyPaid: true, extraSlots: user.extra_slots, slotExpiresAt: user.slot_expires_at ?? undefined };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let nextMeta = current.meta || '{}';
    if (meta) {
      try {
        const parsedCurrent = JSON.parse(current.meta || '{}');
        const parsedNew = typeof meta === 'string' ? JSON.parse(meta) : meta;
        nextMeta = JSON.stringify({ ...parsedCurrent, ...parsedNew });
      } catch {
        nextMeta = typeof meta === 'string' ? meta : JSON.stringify(meta);
      }
    }

    db.prepare(`
      UPDATE payment_transactions
      SET status = 'paid', ref_id = ?, paid_at = ?, meta = ?, updated_at = ?
      WHERE id = ?
    `).run(refId, nowIso, nextMeta, nowIso, id);

    const pkg = current.package_id ? getPackageById(db, current.package_id) : null;
    const durationDays = pkg?.duration_days || 30;

    let newExpiry: Date;
    let newExtraSlots: number;

    if (user.slot_expires_at && new Date(user.slot_expires_at).getTime() > now.getTime() && (user.extra_slots || 0) > 0) {
      newExtraSlots = (user.extra_slots || 0) + current.slots;
      const currentExpiry = new Date(user.slot_expires_at);
      newExpiry = new Date(Math.max(currentExpiry.getTime(), now.getTime() + durationDays * 24 * 60 * 60 * 1000));
    } else {
      newExtraSlots = current.slots;
      newExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }
    const newExpiryIso = newExpiry.toISOString();

    db.prepare('UPDATE users SET extra_slots = ?, slot_expires_at = ?, updated_at = ? WHERE id = ?').run(
      newExtraSlots,
      newExpiryIso,
      nowIso,
      user.id
    );

    // Record subscription grant
    db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, slots, price_toman, duration_days, source_type,
        package_id, package_title, payment_transaction_id,
        starts_at, expires_at, status, created_at
      ) VALUES (?, ?, ?, ?, 'package', ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      user.id,
      current.slots,
      current.amount_toman,
      durationDays,
      current.package_id,
      current.package_title,
      id,
      nowIso,
      newExpiryIso,
      nowIso
    );

    return { success: true, alreadyPaid: false, extraSlots: newExtraSlots, slotExpiresAt: newExpiryIso };
  });

  return txn();
}

export function getUserSubscriptions(db: Database.Database, userId: number): UserSubscriptionRow[] {
  return db
    .prepare('SELECT * FROM user_subscriptions WHERE user_id = ? ORDER BY id DESC')
    .all(userId) as UserSubscriptionRow[];
}

export function markPaymentTransactionFailed(
  db: Database.Database,
  id: number,
  meta?: any
): void {
  const current = db.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(id) as PaymentTransactionRow | undefined;
  if (!current) return;
  if (current.status === 'paid') return; // Do not fail an already paid transaction

  const now = new Date().toISOString();
  let nextMeta = current.meta || '{}';
  if (meta) {
    try {
      const parsedCurrent = JSON.parse(current.meta || '{}');
      const parsedNew = typeof meta === 'string' ? JSON.parse(meta) : meta;
      nextMeta = JSON.stringify({ ...parsedCurrent, ...parsedNew });
    } catch {
      nextMeta = typeof meta === 'string' ? meta : JSON.stringify(meta);
    }
  }

  db.prepare(`
    UPDATE payment_transactions
    SET status = 'failed', meta = ?, updated_at = ?
    WHERE id = ?
  `).run(nextMeta, now, id);
}

export function getUserPaymentTransactions(
  db: Database.Database,
  userId: number,
  limit = 50
): PaymentTransactionRow[] {
  return db.prepare(`
    SELECT * FROM payment_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, limit) as PaymentTransactionRow[];
}
