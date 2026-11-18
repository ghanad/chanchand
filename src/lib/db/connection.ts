import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initDatabase } from './schema';

export const DEFAULT_DB_URL = 'sqlite:///data/price_getter.db';

export {
  DEFAULT_SLOT_PRICE_TOMAN,
  FREE_PRODUCT_LIMIT,
  SLOT_DURATION_DAYS,
  getSlotPriceToman,
} from './constants';

export function resolveDbPath(dbUrl?: string): string {
  const url = dbUrl || process.env.PRICE_GETTER_DB_URL || DEFAULT_DB_URL;
  if (url.startsWith('sqlite:////')) {
    return '/' + url.slice('sqlite:////'.length);
  }
  if (url.startsWith('sqlite:///')) {
    const rawPath = url.slice('sqlite:///'.length);
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  }
  return path.isAbsolute(url) ? url : path.resolve(process.cwd(), url);
}

export function getDatabase(dbUrl?: string): Database.Database {
  const dbPath = resolveDbPath(dbUrl);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initDatabase(db);
  return db;
}
