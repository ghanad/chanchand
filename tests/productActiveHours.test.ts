import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDatabase,
  initDatabase,
  addManagedProduct,
  addManagedSource,
} from '../src/lib/db';

describe('Product collection hours persistence', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  const openDatabase = () => {
    const db = getDatabase();
    initDatabase(db);
    return db;
  };

  beforeEach(() => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `active_hours_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = openDatabase();
    db.close();
  });

  afterEach(() => {
    process.env.PRICE_GETTER_DB_URL = prevDbEnv;
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  });

  it('keeps a custom 12-hour window for a public product across reconnects', () => {
    const db = openDatabase();
    addManagedSource(db, {
      key: 'generic_src',
      adapter: 'generic_html',
      currency: 'IRR',
      price_multiplier: 1,
    });
    addManagedProduct(db, {
      key: 'public-12h',
      title: 'Public 12-hour product',
      url: 'https://example.com/public-12h',
      source_key: 'generic_src',
      is_public: true,
      active_start_hour: 8,
      active_end_hour: 20,
    });
    db.close();

    // Every API request opens a new connection and runs migrations again; the
    // configured window must survive that.
    const reopened = openDatabase();
    const row = reopened
      .prepare('SELECT active_start_hour, active_end_hour FROM managed_products WHERE key = ?')
      .get('public-12h') as { active_start_hour: number; active_end_hour: number };
    reopened.close();

    expect(row.active_start_hour).toBe(8);
    expect(row.active_end_hour).toBe(20);
  });

  it('keeps always-on market products on the 24-hour schedule', () => {
    const db = openDatabase();
    addManagedSource(db, {
      key: 'servix_market',
      adapter: 'servix_market',
      currency: 'IRR',
      price_multiplier: 1,
    });
    addManagedProduct(db, {
      key: 'usd',
      title: 'USD',
      url: 'https://servix.cc/api/v1/assets',
      source_key: 'servix_market',
      is_public: true,
      active_start_hour: 8,
      active_end_hour: 20,
    });
    db.close();

    const reopened = openDatabase();
    const row = reopened
      .prepare('SELECT active_start_hour, active_end_hour FROM managed_products WHERE key = ?')
      .get('usd') as { active_start_hour: number; active_end_hour: number };
    reopened.close();

    expect(row.active_start_hour).toBe(0);
    expect(row.active_end_hour).toBe(23);
  });
});
