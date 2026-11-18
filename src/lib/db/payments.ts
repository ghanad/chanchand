import Database from 'better-sqlite3';
import {
  PackageRow,
  PaymentTransactionRow,
  UserSubscriptionRow,
} from '../types';
import { getUserById } from './users';

export * from './wallet';

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

    // Packages grant unbound credits. Each credit starts its own window when it
    // is attached to a product, so buying early never burns days.
    const newExtraSlots = (user.extra_slots || 0) + current.slots;
    const nominalExpiryIso = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET extra_slots = ?, slot_expires_at = NULL, updated_at = ? WHERE id = ?').run(
      newExtraSlots,
      nowIso,
      user.id
    );

    // Record subscription grant (activated_at stays NULL until a product uses it)
    db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, slots, price_toman, duration_days, source_type,
        package_id, package_title, payment_transaction_id,
        starts_at, expires_at, status, created_at, remaining_slots
      ) VALUES (?, ?, ?, ?, 'package', ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      user.id,
      current.slots,
      current.amount_toman,
      durationDays,
      current.package_id,
      current.package_title,
      id,
      nowIso,
      nominalExpiryIso,
      nowIso,
      current.slots
    );

    return { success: true, alreadyPaid: false, extraSlots: newExtraSlots, slotExpiresAt: undefined };
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
