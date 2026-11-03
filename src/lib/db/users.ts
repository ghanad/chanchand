import Database from 'better-sqlite3';
import { SafeUser, UserQuota, UserRole, UserRow } from '../types';
import { FREE_PRODUCT_LIMIT } from './connection';

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
    const extraSlots = r.extra_slots ?? 0;
    const isAdmin = r.role === 'admin';
    return {
      ...r,
      mobile: r.mobile ?? null,
      wallet_balance: r.wallet_balance ?? 0,
      extra_slots: extraSlots,
      slot_expires_at: r.slot_expires_at ?? null,
      used_slots: Number(r.used_slots ?? 0),
      total_slots: isAdmin ? 999999 : FREE_PRODUCT_LIMIT + extraSlots,
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
  const usedCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM user_products WHERE user_id = ?').get(userId) as { cnt: number }
  )?.cnt ?? 0;

  if (isAdmin) {
    return {
      freeLimit: FREE_PRODUCT_LIMIT,
      extraSlots: 999999,
      totalLimit: 999999,
      usedCount,
      remaining: 999999,
      canAdd: true,
      slotExpiresAt: null,
      daysRemaining: null,
      isExpired: false,
    };
  }

  const user = getUserById(db, userId);
  const rawSlots = user?.extra_slots ?? 0;
  const slotExpiresAt = user?.slot_expires_at ?? null;

  let isExpired = false;
  let daysRemaining: number | null = null;
  let activeExtraSlots = 0;

  if (rawSlots > 0) {
    if (slotExpiresAt) {
      const expiryTime = new Date(slotExpiresAt).getTime();
      const nowTime = Date.now();
      if (expiryTime <= nowTime) {
        isExpired = true;
        daysRemaining = 0;
        activeExtraSlots = 0;
      } else {
        isExpired = false;
        daysRemaining = Math.max(1, Math.ceil((expiryTime - nowTime) / (1000 * 60 * 60 * 24)));
        activeExtraSlots = rawSlots;
      }
    } else {
      activeExtraSlots = rawSlots;
    }
  }

  const totalLimit = FREE_PRODUCT_LIMIT + activeExtraSlots;
  const remaining = Math.max(0, totalLimit - usedCount);

  return {
    freeLimit: FREE_PRODUCT_LIMIT,
    extraSlots: activeExtraSlots,
    totalLimit,
    usedCount,
    remaining,
    canAdd: usedCount < totalLimit,
    slotExpiresAt,
    daysRemaining,
    isExpired,
  };
}
