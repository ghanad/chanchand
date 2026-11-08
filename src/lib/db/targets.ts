import Database from 'better-sqlite3';
import { ManagedProductRow, ManagedTargetRow } from '../types';
import { normalizeTargetUrl, getTargetDeduplicationKey } from '../urls';

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
  const isMultiItem =
    (sourceKey &&
      (sourceKey.includes('market') ||
        sourceKey.includes('servix') ||
        sourceKey.includes('brsapi') ||
        sourceKey.includes('iranjib'))) ||
    targetKey.includes('::');

  // If it's a multi-item endpoint without an explicit symbol, we cannot safely match by URL alone
  const symbolPart = targetKey.includes('::') ? targetKey.split('::')[2] : '';
  if (isMultiItem && !symbolPart) {
    return undefined;
  }

  const allTargets = db.prepare('SELECT * FROM managed_targets').all() as ManagedTargetRow[];
  return allTargets.find((t) => {
    const key = getTargetDeduplicationKey(t.source_key, t.url, t.adapter_settings);
    return key === targetKey;
  });
}

export function getManagedTargets(db: Database.Database, productKey?: string): ManagedTargetRow[] {
  if (productKey) {
    return db
      .prepare('SELECT * FROM managed_targets WHERE product_key = ? ORDER BY id ASC')
      .all(productKey) as ManagedTargetRow[];
  }
  return db.prepare('SELECT * FROM managed_targets ORDER BY id ASC').all() as ManagedTargetRow[];
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
