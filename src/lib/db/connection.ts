import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initDatabase } from './schema';

export const DEFAULT_DB_URL = 'sqlite:///data/price_getter.db';
export const FREE_PRODUCT_LIMIT = 3;
export const DEFAULT_SLOT_PRICE_TOMAN = 50000;

export function getSlotPriceToman(): number {
  const envVal = process.env.SLOT_PRICE_TOMAN;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SLOT_PRICE_TOMAN;
}

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
