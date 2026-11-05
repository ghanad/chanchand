import Database from 'better-sqlite3';
import { ManagedProductRow, ManagedTargetRow } from '../types';
import { normalizeTargetUrl, getTargetDeduplicationKey } from '../urls';
import { getUserById, getUserQuota } from './users';

export function makeProductKey(
  title: string,
  existing: Record<string, any> | Set<string> | string[]
): string {
  let base = title.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  base = base.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!base) {
    base = 'product';
  }

  let candidate = base;
  let index = 2;
  const has = (k: string) => {
    if (existing instanceof Set) return existing.has(k);
    if (Array.isArray(existing)) return existing.includes(k);
    return k in existing;
  };
  while (has(candidate)) {
    candidate = `${base}-${index}`;
    index++;
  }
  return candidate;
}

export function isUserTrackingProduct(
  db: Database.Database,
  userId: number,
  productKey: string
): boolean {
  const row = db
    .prepare('SELECT 1 FROM user_products WHERE user_id = ? AND product_key = ? LIMIT 1')
    .get(userId, productKey);
  return Boolean(row);
}

export function findManagedTargetByUrl(
  db: Database.Database,
  rawUrl: string,
  sourceKey?: string | null,
  adapterSettings?: Record<string, any> | string
): ManagedTargetRow | undefined {
  const norm = normalizeTargetUrl(rawUrl);
  if (!norm) return undefined;

  const targetKey = getTargetDeduplicationKey(sourceKey || '', rawUrl, adapterSettings);
  const isMarket =
    (sourceKey && (sourceKey.includes('market') || sourceKey.includes('servix') || sourceKey.includes('brsapi'))) ||
    targetKey.includes('::');

  // If it's a market endpoint without an explicit symbol, we cannot safely match by URL alone
  if (isMarket && !adapterSettings && !targetKey.split('::')[2]) {
    return undefined;
  }

  const allTargets = db.prepare('SELECT * FROM managed_targets').all() as ManagedTargetRow[];
  return allTargets.find((t) => {
    const key = getTargetDeduplicationKey(t.source_key, t.url, t.adapter_settings);
    return key === targetKey;
  });
}

export function getManagedProducts(
  db: Database.Database,
  filter?: { userId?: number; isAdmin?: boolean }
): ManagedProductRow[] {
  if (filter?.isAdmin) {
    return db
      .prepare(`
        SELECT mp.*, u.username AS owner_username, 1 AS is_tracked_by_user
        FROM managed_products mp
        LEFT JOIN users u ON u.id = mp.user_id
        ORDER BY mp.key ASC
      `)
      .all() as ManagedProductRow[];
  }

  if (filter?.userId !== undefined) {
    const rows = db
      .prepare(`
        SELECT mp.key,
               COALESCE(up.custom_title, mp.title) AS title,
               mp.user_id,
               mp.is_public,
               mp.active_start_hour,
               mp.active_end_hour,
               mp.created_at,
               mp.updated_at,
               u.username AS owner_username,
               CASE WHEN up.user_id IS NOT NULL OR mp.user_id = ? THEN 1 ELSE 0 END AS is_tracked_by_user
        FROM managed_products mp
        LEFT JOIN user_products up ON up.product_key = mp.key AND up.user_id = ?
        LEFT JOIN users u ON u.id = mp.user_id
        WHERE mp.is_public = 1 OR up.user_id = ? OR mp.user_id = ?
        ORDER BY mp.key ASC
      `)
      .all(filter.userId, filter.userId, filter.userId, filter.userId) as any[];

    return rows.map((r) => ({
      ...r,
      is_tracked_by_user: Boolean(r.is_tracked_by_user),
    })) as ManagedProductRow[];
  }

  return db
    .prepare(`
      SELECT mp.*, u.username AS owner_username
      FROM managed_products mp
      LEFT JOIN users u ON u.id = mp.user_id
      ORDER BY mp.key ASC
    `)
    .all() as ManagedProductRow[];
}

export function getManagedTargets(db: Database.Database, productKey?: string): ManagedTargetRow[] {
  if (productKey) {
    return db
      .prepare('SELECT * FROM managed_targets WHERE product_key = ? ORDER BY id ASC')
      .all(productKey) as ManagedTargetRow[];
  }
  return db.prepare('SELECT * FROM managed_targets ORDER BY id ASC').all() as ManagedTargetRow[];
}

export function addManagedProduct(
  db: Database.Database,
  options: {
    title: string;
    url: string;
    source_key?: string | null;
    key?: string;
    user_id?: number | null;
    is_public?: boolean | number;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
    adapter_settings?: Record<string, any> | string;
  }
): { product_key: string; reused?: boolean } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';
  const userId = options.user_id ?? null;
  const isPublic = options.is_public ? 1 : 0;
  const startHour =
    options.active_start_hour !== undefined && options.active_start_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_start_hour)))
      : 8;
  const endHour =
    options.active_end_hour !== undefined && options.active_end_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_end_hour)))
      : 23;
  const now = new Date().toISOString();

  // Deduplication check: does a target with this URL and symbol already exist?
  const existingTarget = findManagedTargetByUrl(db, cleanUrl, sourceKey, options.adapter_settings);
  if (existingTarget) {
    const existingProd = db
      .prepare('SELECT * FROM managed_products WHERE key = ?')
      .get(existingTarget.product_key) as ManagedProductRow | undefined;
    if (existingProd) {
      if (userId != null) {
        const alreadyLinked = db
          .prepare('SELECT 1 FROM user_products WHERE user_id = ? AND product_key = ?')
          .get(userId, existingTarget.product_key);
        if (!alreadyLinked) {
          const userRow = getUserById(db, userId);
          if (userRow && userRow.role !== 'admin') {
            const quota = getUserQuota(db, userId, false);
            if (!quota.canAdd) {
              throw new Error(`سقف ظرفیت محصولات شما (${quota.totalLimit} محصول) تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.`);
            }
          }
        }
        db.prepare(`
          INSERT INTO user_products (user_id, product_key, custom_title, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, product_key) DO UPDATE SET custom_title = excluded.custom_title
        `).run(userId, existingTarget.product_key, cleanTitle, now);
      }
      return { product_key: existingTarget.product_key, reused: true };
    }
  }

  // Check quota for new product creation if user is not admin
  if (userId != null) {
    const userRow = getUserById(db, userId);
    if (userRow && userRow.role !== 'admin') {
      const quota = getUserQuota(db, userId, false);
      if (!quota.canAdd) {
        throw new Error(`سقف ظرفیت محصولات شما (${quota.totalLimit} محصول) تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.`);
      }
    }
  }

  const existing = new Set(
    (db.prepare('SELECT key FROM managed_products').all() as Array<{ key: string }>).map((r) => r.key)
  );

  let productKey = options.key?.trim();
  if (!productKey) {
    productKey = makeProductKey(cleanTitle, existing);
  } else if (existing.has(productKey)) {
    throw new Error(`product key already exists: ${productKey}`);
  }

  let adapterSettingsStr = '{}';
  if (options.adapter_settings) {
    adapterSettingsStr =
      typeof options.adapter_settings === 'string'
        ? options.adapter_settings
        : JSON.stringify(options.adapter_settings);
  }

  const insertProd = db.prepare(
    'INSERT INTO managed_products (key, title, user_id, is_public, active_start_hour, active_end_hour, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertTgt = db.prepare(
    'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
  );
  const insertUserProd = db.prepare(
    'INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at) VALUES (?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    insertProd.run(productKey, cleanTitle, userId, isPublic, startHour, endHour, now, now);
    insertTgt.run(productKey, sourceKey, cleanUrl, adapterSettingsStr, now, now);
    if (userId != null) {
      insertUserProd.run(userId, productKey, cleanTitle, now);
    }
  });
  txn();

  return { product_key: productKey, reused: false };
}

export function updateManagedProduct(
  db: Database.Database,
  productKey: string,
  options: {
    title: string;
    url: string;
    source_key?: string | null;
    is_public?: boolean | number;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
  },
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');
  const sourceKey = options.source_key?.trim() || 'digikala_api';

  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: محصولات عمومی بازار فقط توسط مدیر قابل ویرایش هستند.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان ویرایش محصولات خود را دارید.');
    }
  }

  const now = new Date().toISOString();
  const nextIsPublic =
    requestingUser?.role === 'admin' && options.is_public !== undefined
      ? options.is_public
        ? 1
        : 0
      : prod.is_public ?? 0;

  const nextStartHour =
    requestingUser?.role === 'admin' && options.active_start_hour !== undefined && options.active_start_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_start_hour)))
      : (prod.active_start_hour ?? 8);

  const nextEndHour =
    requestingUser?.role === 'admin' && options.active_end_hour !== undefined && options.active_end_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_end_hour)))
      : (prod.active_end_hour ?? 23);

  const existingTarget = db
    .prepare('SELECT * FROM managed_targets WHERE product_key = ? LIMIT 1')
    .get(productKey) as ManagedTargetRow | undefined;

  const isUrlChanging = existingTarget ? normalizeTargetUrl(existingTarget.url) !== normalizeTargetUrl(cleanUrl) : true;
  const trackersCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM user_products WHERE product_key = ?').get(productKey) as { cnt: number }
  )?.cnt ?? 0;

  // If non-admin changes URL and product is tracked by multiple users, fork for this user
  if (requestingUser && requestingUser.role !== 'admin' && isUrlChanging && trackersCount > 1) {
    db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(requestingUser.id, productKey);
    return addManagedProduct(db, {
      title: cleanTitle,
      url: cleanUrl,
      source_key: sourceKey,
      user_id: requestingUser.id,
      is_public: false,
    });
  }

  const txn = db.transaction(() => {
    db.prepare('UPDATE managed_products SET title = ?, is_public = ?, active_start_hour = ?, active_end_hour = ?, updated_at = ? WHERE key = ?').run(
      cleanTitle,
      nextIsPublic,
      nextStartHour,
      nextEndHour,
      now,
      productKey
    );
    if (requestingUser && isTracker) {
      db.prepare('UPDATE user_products SET custom_title = ? WHERE user_id = ? AND product_key = ?').run(
        cleanTitle,
        requestingUser.id,
        productKey
      );
    }
    if (existingTarget) {
      db.prepare('UPDATE managed_targets SET source_key = ?, url = ?, updated_at = ? WHERE id = ?').run(
        sourceKey,
        cleanUrl,
        now,
        existingTarget.id
      );
    } else {
      db.prepare(
        'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
      ).run(productKey, sourceKey, cleanUrl, '{}', now, now);
    }
  });
  txn();

  return { product_key: productKey };
}

export function deleteManagedProduct(
  db: Database.Database,
  productKey: string,
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: محصولات عمومی بازار فقط توسط مدیر قابل حذف هستند.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان حذف محصولات خود را دارید.');
    }
  }

  const txn = db.transaction(() => {
    if (requestingUser && requestingUser.role !== 'admin') {
      db.prepare('DELETE FROM user_products WHERE user_id = ? AND product_key = ?').run(requestingUser.id, productKey);

      const remaining = db
        .prepare('SELECT COUNT(*) as cnt FROM user_products WHERE product_key = ?')
        .get(productKey) as { cnt: number };

      if (remaining.cnt > 0) {
        if (prod.user_id === requestingUser.id) {
          const nextUser = db
            .prepare('SELECT user_id FROM user_products WHERE product_key = ? ORDER BY id ASC LIMIT 1')
            .get(productKey) as { user_id: number } | undefined;
          if (nextUser) {
            db.prepare('UPDATE managed_products SET user_id = ? WHERE key = ?').run(nextUser.user_id, productKey);
          }
        }
        return;
      }
    }

    db.prepare('DELETE FROM user_products WHERE product_key = ?').run(productKey);
    db.prepare('DELETE FROM managed_targets WHERE product_key = ?').run(productKey);
    db.prepare('DELETE FROM managed_products WHERE key = ?').run(productKey);
  });
  txn();

  return { product_key: productKey };
}

export function setManagedProductEnabled(
  db: Database.Database,
  productKey: string,
  enabled: boolean,
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const prod = db.prepare('SELECT * FROM managed_products WHERE key = ?').get(productKey) as ManagedProductRow | undefined;
  if (!prod) throw new Error(`unknown product: ${productKey}`);

  const isTracker = requestingUser ? isUserTrackingProduct(db, requestingUser.id, productKey) : false;
  const isOwner = requestingUser ? prod.user_id === requestingUser.id : false;

  if (requestingUser && requestingUser.role !== 'admin') {
    if (prod.is_public === 1) {
      throw new Error('دسترسی غیرمجاز: وضعیت محصولات عمومی بازار فقط توسط مدیر قابل تغییر است.');
    }
    if (!isOwner && !isTracker) {
      throw new Error('دسترسی غیرمجاز: شما فقط امکان تغییر وضعیت محصولات خود را دارید.');
    }
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE managed_targets SET enabled = ?, updated_at = ? WHERE product_key = ?').run(
    enabled ? 1 : 0,
    now,
    productKey
  );

  return { product_key: productKey };
}
