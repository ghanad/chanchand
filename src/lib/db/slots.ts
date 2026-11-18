import Database from 'better-sqlite3';
import { FREE_PRODUCT_LIMIT, SLOT_DURATION_DAYS } from './constants';
import { getUserById } from './users';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Free slots already taken by the user's *other* products. */
function countFreeSlots(db: Database.Database, userId: number, excludeProductKey: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM user_products
       WHERE user_id = ? AND slot_expires_at IS NULL AND product_key <> ?`
    )
    .get(userId, excludeProductKey) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Decrement the oldest purchase record that still has unused credits, so the
 * wallet history can answer "how much of what I bought is left?".
 */
function consumeSubscriptionCredit(db: Database.Database, userId: number): void {
  const row = db
    .prepare(
      `SELECT id, remaining_slots FROM user_subscriptions
       WHERE user_id = ? AND remaining_slots > 0
       ORDER BY id ASC LIMIT 1`
    )
    .get(userId) as { id: number; remaining_slots: number } | undefined;
  if (!row) return;
  db.prepare('UPDATE user_subscriptions SET remaining_slots = ? WHERE id = ?').run(
    Math.max(0, row.remaining_slots - 1),
    row.id
  );
}

function quotaMessage(): string {
  return 'سقف ظرفیت محصولات شما تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.';
}

/**
 * Attach a slot to a product the user has just started tracking.
 *
 * A permanent free slot is used while the user still has one. Otherwise one
 * purchased credit is consumed and its 30-day window starts **now** — so the
 * user never loses days by buying a slot before deciding which product to add.
 */
export function assignSlotToNewProduct(
  db: Database.Database,
  userId: number,
  productKey: string,
  options?: { isAdmin?: boolean }
): void {
  if (options?.isAdmin) return;

  if (countFreeSlots(db, userId, productKey) < FREE_PRODUCT_LIMIT) {
    // Free slot: leave slot_expires_at NULL.
    return;
  }

  const user = getUserById(db, userId);
  const credits = Math.max(0, user?.extra_slots ?? 0);
  if (credits <= 0) {
    throw new Error(quotaMessage());
  }

  const now = new Date();
  const expires = new Date(now.getTime() + SLOT_DURATION_DAYS * DAY_MS).toISOString();

  db.prepare('UPDATE users SET extra_slots = ?, updated_at = ? WHERE id = ?').run(
    credits - 1,
    now.toISOString(),
    userId
  );
  db.prepare(
    'UPDATE user_products SET slot_started_at = ?, slot_expires_at = ? WHERE user_id = ? AND product_key = ?'
  ).run(now.toISOString(), expires, userId, productKey);
  consumeSubscriptionCredit(db, userId);
}

/**
 * Start a fresh paid window on a product whose slot has lapsed (or which is
 * beyond the free limit). Consumes one purchased credit.
 */
export function renewProductSlot(
  db: Database.Database,
  userId: number,
  productKey: string,
  durationDays: number = SLOT_DURATION_DAYS
): { slot_started_at: string; slot_expires_at: string; extra_slots: number } {
  const txn = db.transaction(() => {
    const row = db
      .prepare('SELECT slot_expires_at FROM user_products WHERE user_id = ? AND product_key = ?')
      .get(userId, productKey) as { slot_expires_at: string | null } | undefined;
    if (!row) {
      throw new Error('این محصول در فهرست محصولات شما نیست.');
    }

    const user = getUserById(db, userId);
    if (!user) {
      throw new Error('کاربر یافت نشد.');
    }
    const credits = Math.max(0, user.extra_slots ?? 0);
    if (credits <= 0) {
      throw new Error('اعتبار اسلات خالی ندارید. ابتدا یک اسلات خریداری کنید.');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expires = new Date(now.getTime() + durationDays * DAY_MS).toISOString();

    db.prepare('UPDATE users SET extra_slots = ?, updated_at = ? WHERE id = ?').run(credits - 1, nowIso, userId);
    db.prepare(
      `UPDATE user_products
       SET slot_started_at = ?, slot_expires_at = ?, slot_transferred_at = NULL
       WHERE user_id = ? AND product_key = ?`
    ).run(nowIso, expires, userId, productKey);
    consumeSubscriptionCredit(db, userId);

    return { slot_started_at: nowIso, slot_expires_at: expires, extra_slots: credits - 1 };
  });

  return txn();
}

/**
 * Move the remaining window of one paid slot to another tracked product. A slot
 * may be transferred at most once, so this cannot be used to farm extra days.
 */
export function transferProductSlot(
  db: Database.Database,
  userId: number,
  fromProductKey: string,
  toProductKey: string
): { from: string; to: string; slot_expires_at: string } {
  if (fromProductKey === toProductKey) {
    throw new Error('محصول مبدأ و مقصد یکسان است.');
  }

  const txn = db.transaction(() => {
    const from = db
      .prepare('SELECT slot_started_at, slot_expires_at, slot_transferred_at FROM user_products WHERE user_id = ? AND product_key = ?')
      .get(userId, fromProductKey) as
      | { slot_started_at: string | null; slot_expires_at: string | null; slot_transferred_at: string | null }
      | undefined;
    const to = db
      .prepare('SELECT slot_expires_at FROM user_products WHERE user_id = ? AND product_key = ?')
      .get(userId, toProductKey) as { slot_expires_at: string | null } | undefined;

    if (!from) throw new Error('محصول مبدأ در فهرست شما نیست.');
    if (!to) throw new Error('محصول مقصد در فهرست شما نیست.');
    if (!from.slot_expires_at) throw new Error('این محصول روی اسلات رایگان است و قابل انتقال نیست.');
    if (from.slot_transferred_at) throw new Error('این اسلات قبلاً یک‌بار منتقل شده است.');
    if (new Date(from.slot_expires_at).getTime() <= Date.now()) {
      throw new Error('پنجره این اسلات تمام شده است و قابل انتقال نیست.');
    }
    if (to.slot_expires_at && new Date(to.slot_expires_at).getTime() > Date.now()) {
      throw new Error('محصول مقصد همین حالا اسلات فعال دارد.');
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      'UPDATE user_products SET slot_expires_at = ?, slot_transferred_at = ? WHERE user_id = ? AND product_key = ?'
    ).run(nowIso, nowIso, userId, fromProductKey);
    db.prepare(
      `UPDATE user_products
       SET slot_started_at = ?, slot_expires_at = ?, slot_transferred_at = ?
       WHERE user_id = ? AND product_key = ?`
    ).run(from.slot_started_at, from.slot_expires_at, nowIso, userId, toProductKey);

    return { from: fromProductKey, to: toProductKey, slot_expires_at: from.slot_expires_at };
  });

  return txn();
}

/**
 * The one-time Digikala 30-day history import is granted per (user, product)
 * for the lifetime of the product key, even if the user deletes and re-adds it.
 */
export function hasHistoryGrant(db: Database.Database, userId: number, productKey: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM product_history_grants WHERE user_id = ? AND product_key = ? LIMIT 1')
    .get(userId, productKey);
  return Boolean(row);
}

export function recordHistoryGrant(db: Database.Database, userId: number, productKey: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO product_history_grants (user_id, product_key, granted_at) VALUES (?, ?, ?)'
  ).run(userId, productKey, new Date().toISOString());
}
