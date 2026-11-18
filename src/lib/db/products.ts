import Database from 'better-sqlite3';
import { ManagedProductRow } from '../types';
import { normalizeTargetUrl } from '../urls';
import { getUserById, getUserQuota } from './users';
import { assignSlotToNewProduct } from './slots';
import { findManagedTargetByUrl, isUserTrackingProduct } from './targets';

export * from './targets';
export * from './productRefreshes';

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

export function resolveTargetSourceKey(rawUrl: string, sourceKey?: string | null): string {
  let key = sourceKey?.trim();
  if (rawUrl.includes('iranjib.ir')) {
    if (!key || key === 'brsapi_market' || key === 'digikala_api') {
      key = 'iranjib';
    }
  } else if (!key) {
    key = 'digikala_api';
  }
  return key;
}

export function parseAdapterSettings(
  sourceKey: string,
  settings: Record<string, any> | string | undefined,
  defaultItemName?: string
): Record<string, any> {
  let obj: Record<string, any> = {};
  if (settings) {
    try {
      obj = typeof settings === 'string' ? JSON.parse(settings) : { ...settings };
    } catch {
      obj = {};
    }
  }
  if (sourceKey === 'iranjib' && !obj.item_name && !obj.name && defaultItemName) {
    obj.item_name = defaultItemName;
  }
  return obj;
}

export function assertUserCanAddProduct(db: Database.Database, userId: number): void {
  const userRow = getUserById(db, userId);
  if (userRow && userRow.role !== 'admin') {
    const quota = getUserQuota(db, userId, false);
    if (!quota.canAdd) {
      throw new Error(
        `سقف ظرفیت محصولات شما (${quota.totalLimit} محصول) تکمیل شده است. لطفاً ابتدا ظرفیت اضافه خریداری کنید.`
      );
    }
  }
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
               mp.show_usd_chart,
               mp.show_gold_chart,
               mp.active_start_hour,
               mp.active_end_hour,
               mp.created_at,
               mp.updated_at,
               u.username AS owner_username,
               CASE WHEN up.user_id IS NOT NULL OR mp.user_id = ? THEN 1 ELSE 0 END AS is_tracked_by_user,
               COALESCE(
                 up.last_manual_refresh_at,
                 (SELECT MAX(refreshed_at) FROM product_refresh_logs prl WHERE prl.user_id = ? AND prl.product_key = mp.key)
               ) AS last_manual_refresh_at,
               up.slot_started_at AS slot_started_at,
               up.slot_expires_at AS slot_expires_at
        FROM managed_products mp
        LEFT JOIN user_products up ON up.product_key = mp.key AND up.user_id = ?
        LEFT JOIN users u ON u.id = mp.user_id
        WHERE mp.is_public = 1 OR up.user_id = ? OR mp.user_id = ?
        ORDER BY mp.key ASC
      `)
      .all(filter.userId, filter.userId, filter.userId, filter.userId, filter.userId) as any[];

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

export function addManagedProduct(
  db: Database.Database,
  options: {
    title: string;
    url: string;
    source_key?: string | null;
    key?: string;
    user_id?: number | null;
    is_public?: boolean | number;
    show_usd_chart?: boolean | number;
    show_gold_chart?: boolean | number;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
    adapter_settings?: Record<string, any> | string;
    /** Digikala colour id; null/undefined means "cheapest of the whole product". */
    color_id?: string | null;
    color_label?: string | null;
  }
): { product_key: string; reused?: boolean } {
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');

  const colorId = options.color_id === undefined || options.color_id === null
    ? null
    : String(options.color_id).trim() || null;
  const colorLabel = options.color_label === undefined || options.color_label === null
    ? null
    : String(options.color_label).trim() || null;

  const rawTitle = options.title.trim();
  if (!rawTitle) throw new Error('title cannot be empty');
  // Two colours of the same product must be distinguishable in the list.
  const cleanTitle =
    colorLabel && !rawTitle.includes(colorLabel) ? `${rawTitle} - ${colorLabel}` : rawTitle;

  const sourceKey = resolveTargetSourceKey(cleanUrl, options.source_key);
  const userId = options.user_id ?? null;
  const isPublic = options.is_public ? 1 : 0;
  const showUsdChart = options.show_usd_chart ? 1 : 0;
  const showGoldChart = options.show_gold_chart ? 1 : 0;
  const startHour =
    options.active_start_hour !== undefined && options.active_start_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_start_hour)))
      : 8;
  const endHour =
    options.active_end_hour !== undefined && options.active_end_hour !== null
      ? Math.max(0, Math.min(23, Number(options.active_end_hour)))
      : 23;
  const now = new Date().toISOString();

  if (sourceKey === 'iranjib') {
    const srcRow = db.prepare('SELECT 1 FROM managed_sources WHERE key = ? LIMIT 1').get('iranjib');
    if (!srcRow) {
      db.prepare(`
        INSERT OR IGNORE INTO managed_sources (
          key, adapter, timeout_seconds, rate_limit_seconds, currency, price_multiplier, headers, settings, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('iranjib', 'iranjib', 15, 2, 'TOMAN', 10, '{}', JSON.stringify({ cache_ttl_seconds: 60 }), now, now);
    }
  }

  const adapterSettingsObj = parseAdapterSettings(sourceKey, options.adapter_settings, cleanTitle);
  const adapterSettingsStr = JSON.stringify(adapterSettingsObj);

  // Deduplication check: same URL + same colour means the same tracked product.
  const existingTarget = findManagedTargetByUrl(db, cleanUrl, sourceKey, adapterSettingsObj, colorId);
  if (existingTarget) {
    const existingProd = db
      .prepare('SELECT * FROM managed_products WHERE key = ?')
      .get(existingTarget.product_key) as ManagedProductRow | undefined;
    if (existingProd) {
      if (userId != null) {
        const alreadyLinked = isUserTrackingProduct(db, userId, existingTarget.product_key);
        if (!alreadyLinked) {
          const linkTxn = db.transaction(() => {
            assertUserCanAddProduct(db, userId);
            db.prepare(`
              INSERT INTO user_products (user_id, product_key, custom_title, created_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, product_key) DO UPDATE SET custom_title = excluded.custom_title
            `).run(userId, existingTarget.product_key, cleanTitle, now);
            assignSlotToNewProduct(db, userId, existingTarget.product_key, {
              isAdmin: getUserById(db, userId)?.role === 'admin',
            });
          });
          linkTxn();
        } else {
          db.prepare(
            'UPDATE user_products SET custom_title = ? WHERE user_id = ? AND product_key = ?'
          ).run(cleanTitle, userId, existingTarget.product_key);
        }
      }
      return { product_key: existingTarget.product_key, reused: true };
    }
  }

  // Check quota for new product creation if user is not admin
  if (userId != null) {
    assertUserCanAddProduct(db, userId);
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

  const insertProd = db.prepare(
    'INSERT INTO managed_products (key, title, user_id, is_public, show_usd_chart, show_gold_chart, active_start_hour, active_end_hour, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertTgt = db.prepare(
    'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, color_id, color_label, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)'
  );
  const insertUserProd = db.prepare(
    'INSERT OR IGNORE INTO user_products (user_id, product_key, custom_title, created_at) VALUES (?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    insertProd.run(productKey, cleanTitle, userId, isPublic, showUsdChart, showGoldChart, startHour, endHour, now, now);
    insertTgt.run(productKey, sourceKey, cleanUrl, adapterSettingsStr, colorId, colorLabel, now, now);
    if (userId != null) {
      insertUserProd.run(userId, productKey, cleanTitle, now);
      assignSlotToNewProduct(db, userId, productKey, {
        isAdmin: getUserById(db, userId)?.role === 'admin',
      });
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
    show_usd_chart?: boolean | number;
    show_gold_chart?: boolean | number;
    active_start_hour?: number | null;
    active_end_hour?: number | null;
  },
  requestingUser?: { id: number; role: string }
): { product_key: string } {
  const cleanTitle = options.title.trim();
  if (!cleanTitle) throw new Error('title cannot be empty');
  const cleanUrl = options.url.trim();
  if (!cleanUrl) throw new Error('url cannot be empty');

  const sourceKey = resolveTargetSourceKey(cleanUrl, options.source_key);

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

  const nextShowUsdChart =
    requestingUser?.role === 'admin' && options.show_usd_chart !== undefined
      ? options.show_usd_chart
        ? 1
        : 0
      : (prod.show_usd_chart ?? 0);

  const nextShowGoldChart =
    requestingUser?.role === 'admin' && options.show_gold_chart !== undefined
      ? options.show_gold_chart
        ? 1
        : 0
      : (prod.show_gold_chart ?? 0);

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
    .get(productKey) as any;

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
      show_usd_chart: false,
      show_gold_chart: false,
      color_id: existingTarget?.color_id ?? null,
      color_label: existingTarget?.color_label ?? null,
    });
  }

  const txn = db.transaction(() => {
    db.prepare('UPDATE managed_products SET title = ?, is_public = ?, show_usd_chart = ?, show_gold_chart = ?, active_start_hour = ?, active_end_hour = ?, updated_at = ? WHERE key = ?').run(
      cleanTitle,
      nextIsPublic,
      nextShowUsdChart,
      nextShowGoldChart,
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
      const adapterSettingsObj = parseAdapterSettings(sourceKey, existingTarget.adapter_settings, cleanTitle);
      // A different URL is a different product, so a colour picked for the old
      // one no longer applies: fall back to the "cheapest of the product" rule.
      const nextColorId = isUrlChanging ? null : existingTarget.color_id ?? null;
      const nextColorLabel = isUrlChanging ? null : existingTarget.color_label ?? null;
      db.prepare('UPDATE managed_targets SET source_key = ?, url = ?, adapter_settings = ?, color_id = ?, color_label = ?, updated_at = ? WHERE id = ?').run(
        sourceKey,
        cleanUrl,
        JSON.stringify(adapterSettingsObj),
        nextColorId,
        nextColorLabel,
        now,
        existingTarget.id
      );
    } else {
      const adapterSettings = sourceKey === 'iranjib' ? JSON.stringify({ item_name: cleanTitle }) : '{}';
      db.prepare(
        'INSERT INTO managed_targets (product_key, source_key, url, enabled, adapter_settings, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
      ).run(productKey, sourceKey, cleanUrl, adapterSettings, now, now);
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
