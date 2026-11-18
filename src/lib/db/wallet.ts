import Database from 'better-sqlite3';
import {
  UserQuota,
  WalletTransactionRow,
} from '../types';
import { getSlotPriceToman, SLOT_DURATION_DAYS } from './constants';
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
): {
  extra_slots: number;
  slot_expires_at: null;
  wallet_balance: number;
  transaction: WalletTransactionRow;
  quota: UserQuota;
} {
  const price = params.slotPrice ?? getSlotPriceToman();
  if (price <= 0) {
    throw new Error('قیمت اسلات نامعتبر است.');
  }
  const durationDays = params.durationDays ?? SLOT_DURATION_DAYS;

  const txn = db.transaction(() => {
    const user = getUserById(db, params.userId);
    if (!user) {
      throw new Error(`کاربر یافت نشد.`);
    }

    const currentBalance = user.wallet_balance || 0;
    if (currentBalance < price) {
      throw new Error(
        `موجودی کیف پول شما (${currentBalance.toLocaleString('fa-IR')} تومان) برای خرید اسلات (${price.toLocaleString('fa-IR')} تومان) کافی نیست.`
      );
    }

    const newBalance = currentBalance - price;
    const now = new Date();
    const nowIso = now.toISOString();
    // A purchase adds an unbound credit. Its 30-day window starts only when the
    // user attaches it to a product, so no days are lost while deciding.
    const newCredits = (user.extra_slots || 0) + 1;

    db.prepare(`
      UPDATE users
      SET wallet_balance = ?, extra_slots = ?, slot_expires_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(newBalance, newCredits, nowIso, params.userId);

    const desc = `خرید ۱ اسلات پایش محصول (${durationDays} روزه)`;
    const insertTxn = db.prepare(`
      INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description, created_at)
      VALUES (?, ?, ?, 'slot_purchase', ?, ?)
    `);
    const res = insertTxn.run(params.userId, -price, newBalance, desc, nowIso);

    // Purchase record. `expires_at` is a placeholder until the credit is
    // activated on a product, at which point the real window is written back.
    db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, slots, price_toman, duration_days, source_type,
        starts_at, expires_at, status, created_at, remaining_slots
      ) VALUES (?, ?, ?, ?, 'wallet_slot', ?, ?, 'active', ?, 1)
    `).run(
      params.userId,
      1,
      price,
      durationDays,
      nowIso,
      new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      nowIso
    );

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
      extra_slots: newCredits,
      slot_expires_at: null,
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
