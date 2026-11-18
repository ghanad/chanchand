import Database from 'better-sqlite3';
import { ProductSlotInfo, SafeUser, UserQuota, UserRole, UserRow } from '../types';
import { FREE_PRODUCT_LIMIT } from './constants';

export function getUserByUsername(db: Database.Database, username: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
  if (!row) return null;
  return {
    ...row,
    mobile: row.mobile ?? null,
    wallet_balance: row.wallet_balance ?? 0,
    extra_slots: row.extra_slots ?? 0,
    slot_expires_at: row.slot_expires_at ?? null,
  };
}

export function getUserById(db: Database.Database, id: number): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) return null;
  return {
    ...row,
    mobile: row.mobile ?? null,
    wallet_balance: row.wallet_balance ?? 0,
    extra_slots: row.extra_slots ?? 0,
    slot_expires_at: row.slot_expires_at ?? null,
  };
}

export function listUsers(db: Database.Database): SafeUser[] {
  const rows = db.prepare(`
    SELECT 
      u.id, u.username, u.email, u.mobile, u.role, u.must_change_password, u.wallet_balance, u.extra_slots, u.slot_expires_at, u.created_at, u.updated_at,
      COALESCE((SELECT COUNT(*) FROM user_products up WHERE up.user_id = u.id), 0) AS used_slots
    FROM users u
    ORDER BY u.id ASC
  `).all() as (Omit<SafeUser, 'must_change_password'> & { must_change_password: number; used_slots: number })[];
  return rows.map((r) => {
    const isAdmin = r.role === 'admin';
    const quota = getUserQuota(db, r.id, isAdmin);
    return {
      ...r,
      mobile: r.mobile ?? null,
      wallet_balance: r.wallet_balance ?? 0,
      extra_slots: r.extra_slots ?? 0,
      slot_expires_at: null,
      used_slots: quota.usedCount,
      total_slots: isAdmin ? 999999 : quota.totalLimit,
      paid_active: quota.paidActive ?? 0,
      paid_expired: quota.paidExpired ?? 0,
      must_change_password: Boolean(r.must_change_password),
    };
  });
}

export function countUsers(db: Database.Database): number {
  const row = db.prepare('SELECT count(*) as count FROM users').get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export function countAdmins(db: Database.Database): number {
  const row = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin'").get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export function createUser(
  db: Database.Database,
  params: {
    username: string;
    password_hash: string;
    email?: string | null;
    mobile?: string | null;
    role?: UserRole;
    must_change_password?: boolean;
    wallet_balance?: number;
    extra_slots?: number;
    slot_expires_at?: string | null;
  }
): SafeUser {
  const now = new Date().toISOString();
  const role = params.role || 'viewer';
  const email = params.email || null;
  const mobile = params.mobile || null;
  const username = params.username.trim();
  const mustChange = params.must_change_password ? 1 : 0;
  const walletBalance = params.wallet_balance ?? 0;
  const extraSlots = params.extra_slots ?? 0;
  const slotExpiresAt = params.slot_expires_at || null;

  const stmt = db.prepare(`
    INSERT INTO users (username, email, mobile, password_hash, role, must_change_password, wallet_balance, extra_slots, slot_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(username, email, mobile, params.password_hash, role, mustChange, walletBalance, extraSlots, slotExpiresAt, now, now);
  const id = Number(result.lastInsertRowid);

  return {
    id,
    username,
    email,
    mobile,
    role,
    must_change_password: Boolean(mustChange),
    wallet_balance: walletBalance,
    extra_slots: extraSlots,
    slot_expires_at: slotExpiresAt,
    created_at: now,
    updated_at: now,
  };
}

export function updateUser(
  db: Database.Database,
  id: number,
  params: {
    password_hash?: string;
    role?: UserRole;
    email?: string | null;
    mobile?: string | null;
    must_change_password?: boolean;
    extra_slots?: number;
    slot_expires_at?: string | null;
  }
): SafeUser {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  const now = new Date().toISOString();
  const nextPasswordHash = params.password_hash !== undefined ? params.password_hash : existing.password_hash;
  const nextRole = params.role !== undefined ? params.role : existing.role;
  const nextEmail = params.email !== undefined ? params.email : existing.email;
  const nextMobile = params.mobile !== undefined ? params.mobile : (existing.mobile ?? null);
  const nextMustChange = params.must_change_password !== undefined
    ? (params.must_change_password ? 1 : 0)
    : (existing.must_change_password ?? 0);
  const nextExtraSlots = params.extra_slots !== undefined ? params.extra_slots : existing.extra_slots;
  const nextSlotExpiresAt = params.slot_expires_at !== undefined ? params.slot_expires_at : (existing.slot_expires_at ?? null);

  if (existing.role === 'admin' && nextRole !== 'admin') {
    const adminCount = countAdmins(db);
    if (adminCount <= 1) {
      throw new Error('امکان تغییر نقش آخرین مدیر سیستم وجود ندارد.');
    }
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?, role = ?, email = ?, mobile = ?, must_change_password = ?, extra_slots = ?, slot_expires_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nextPasswordHash, nextRole, nextEmail, nextMobile, nextMustChange, nextExtraSlots, nextSlotExpiresAt, now, id);

  return {
    id,
    username: existing.username,
    email: nextEmail,
    mobile: nextMobile,
    role: nextRole,
    must_change_password: Boolean(nextMustChange),
    wallet_balance: existing.wallet_balance,
    extra_slots: nextExtraSlots,
    slot_expires_at: nextSlotExpiresAt,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function updateUserProfile(
  db: Database.Database,
  id: number,
  params: { email?: string | null; mobile?: string | null }
): SafeUser {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  const now = new Date().toISOString();
  const nextEmail = params.email !== undefined ? (params.email?.trim() || null) : existing.email;
  const nextMobile = params.mobile !== undefined ? (params.mobile?.trim() || null) : (existing.mobile ?? null);

  db.prepare(`
    UPDATE users
    SET email = ?, mobile = ?, updated_at = ?
    WHERE id = ?
  `).run(nextEmail, nextMobile, now, id);

  return {
    id,
    username: existing.username,
    email: nextEmail,
    mobile: nextMobile,
    role: existing.role,
    must_change_password: Boolean(existing.must_change_password),
    wallet_balance: existing.wallet_balance,
    extra_slots: existing.extra_slots,
    slot_expires_at: existing.slot_expires_at ?? null,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function deleteUser(db: Database.Database, id: number): boolean {
  const existing = getUserById(db, id);
  if (!existing) {
    throw new Error(`کاربر با شناسه ${id} یافت نشد.`);
  }

  if (existing.role === 'admin') {
    const adminCount = countAdmins(db);
    if (adminCount <= 1) {
      throw new Error('امکان حذف آخرین مدیر سیستم وجود ندارد.');
    }
  }

  const res = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return res.changes > 0;
}

export function getUserQuota(db: Database.Database, userId: number, isAdmin = false): UserQuota {
  const rows = db
    .prepare('SELECT id, product_key, slot_expires_at FROM user_products WHERE user_id = ? ORDER BY id ASC')
    .all(userId) as Array<{ id: number; product_key: string; slot_expires_at: string | null }>;

  if (isAdmin) {
    return {
      freeLimit: FREE_PRODUCT_LIMIT,
      extraSlots: 999999,
      totalLimit: 999999,
      usedCount: rows.length,
      remaining: 999999,
      canAdd: true,
      slotExpiresAt: null,
      daysRemaining: null,
      isExpired: false,
      freeUsed: rows.length,
      paidActive: 0,
      paidExpired: 0,
    };
  }

  const user = getUserById(db, userId);
  // `extra_slots` is now a pool of purchased-but-unbound slot credits. A credit
  // starts its 30-day window only when it is attached to a product.
  const credits = Math.max(0, user?.extra_slots ?? 0);
  const now = Date.now();

  const freeRows = rows.filter((r) => r.slot_expires_at == null);
  const paidRows = rows.filter((r) => r.slot_expires_at != null);
  const activePaidRows = paidRows.filter((r) => new Date(r.slot_expires_at as string).getTime() > now);
  const expiredPaidRows = paidRows.filter((r) => new Date(r.slot_expires_at as string).getTime() <= now);

  // Only the oldest FREE_PRODUCT_LIMIT free rows are actually monitored.
  const freeUsed = Math.min(freeRows.length, FREE_PRODUCT_LIMIT);
  const paidActive = activePaidRows.length;
  const paidExpired = expiredPaidRows.length;

  const totalLimit = FREE_PRODUCT_LIMIT + paidActive + credits;
  const usedCount = freeUsed + paidActive;
  const remaining = Math.max(0, FREE_PRODUCT_LIMIT - freeUsed + credits);

  let nextExpiry: string | null = null;
  for (const r of activePaidRows) {
    const iso = r.slot_expires_at as string;
    if (!nextExpiry || new Date(iso).getTime() < new Date(nextExpiry).getTime()) {
      nextExpiry = iso;
    }
  }
  const daysRemaining = nextExpiry
    ? Math.max(1, Math.ceil((new Date(nextExpiry).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    freeLimit: FREE_PRODUCT_LIMIT,
    extraSlots: credits,
    totalLimit,
    usedCount,
    remaining,
    canAdd: remaining > 0,
    slotExpiresAt: nextExpiry,
    daysRemaining,
    isExpired: paidExpired > 0,
    freeUsed,
    paidActive,
    paidExpired,
  };
}

/**
 * Every tracked product with the slot window attached to it. This is what the
 * wallet page and the product list use to answer "how long is this product
 * monitored for, and which products are out of window?".
 */
export function getUserProductSlots(db: Database.Database, userId: number): ProductSlotInfo[] {
  const rows = db
    .prepare(`
      SELECT up.product_key,
             up.slot_started_at,
             up.slot_expires_at,
             up.slot_transferred_at,
             COALESCE(mp.title, up.product_key) AS title
      FROM user_products up
      LEFT JOIN managed_products mp ON mp.key = up.product_key
      WHERE up.user_id = ?
      ORDER BY up.id ASC
    `)
    .all(userId) as Array<{
    product_key: string;
    slot_started_at: string | null;
    slot_expires_at: string | null;
    slot_transferred_at: string | null;
    title: string;
  }>;

  const now = Date.now();
  let freeSeen = 0;

  return rows.map((row) => {
    if (row.slot_expires_at == null) {
      freeSeen += 1;
      const isFree = freeSeen <= FREE_PRODUCT_LIMIT;
      return {
        product_key: row.product_key,
        title: row.title,
        kind: isFree ? 'free' : 'expired',
        started_at: row.slot_started_at,
        expires_at: null,
        days_remaining: null,
        transferred_at: row.slot_transferred_at,
      } satisfies ProductSlotInfo;
    }

    const expiresMs = new Date(row.slot_expires_at).getTime();
    const active = expiresMs > now;
    return {
      product_key: row.product_key,
      title: row.title,
      kind: active ? 'paid' : 'expired',
      started_at: row.slot_started_at,
      expires_at: row.slot_expires_at,
      days_remaining: active ? Math.max(1, Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24))) : 0,
      transferred_at: row.slot_transferred_at,
    } satisfies ProductSlotInfo;
  });
}
