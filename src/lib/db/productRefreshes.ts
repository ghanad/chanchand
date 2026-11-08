import Database from 'better-sqlite3';
import { getDayBounds } from './scheduler';

export function hasUserRefreshedProductToday(
  db: Database.Database,
  userId: number,
  productKey: string,
  now = new Date()
): boolean {
  const { startOfDay, endOfDay } = getDayBounds(now);

  const logRow = db
    .prepare(`
      SELECT id FROM product_refresh_logs
      WHERE user_id = ? AND product_key = ? AND refreshed_at >= ? AND refreshed_at <= ?
      LIMIT 1
    `)
    .get(userId, productKey, startOfDay, endOfDay);

  if (logRow) return true;

  const upRow = db
    .prepare(`
      SELECT last_manual_refresh_at FROM user_products
      WHERE user_id = ? AND product_key = ?
    `)
    .get(userId, productKey) as { last_manual_refresh_at?: string | null } | undefined;

  if (upRow?.last_manual_refresh_at) {
    if (upRow.last_manual_refresh_at >= startOfDay && upRow.last_manual_refresh_at <= endOfDay) {
      return true;
    }
  }

  return false;
}

export function recordProductRefresh(
  db: Database.Database,
  userId: number,
  productKey: string,
  now = new Date()
): void {
  const timestamp = now.toISOString();

  db.prepare(`
    INSERT INTO product_refresh_logs (user_id, product_key, refreshed_at)
    VALUES (?, ?, ?)
  `).run(userId, productKey, timestamp);

  db.prepare(`
    UPDATE user_products
    SET last_manual_refresh_at = ?
    WHERE user_id = ? AND product_key = ?
  `).run(timestamp, userId, productKey);
}
