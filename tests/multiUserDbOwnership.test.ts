import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getDatabase,
  initDatabase,
  createUser,
  addManagedProduct,
  getManagedProducts,
  updateManagedProduct,
  deleteManagedProduct,
} from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

describe('Multi-user Product Ownership (Database Layer)', () => {
  let tempDbPath: string;
  let prevDbEnv: string | undefined;

  let adminId: number;
  let user1Id: number;
  let user2Id: number;

  beforeEach(async () => {
    prevDbEnv = process.env.PRICE_GETTER_DB_URL;
    const tmpName = `multiuser_db_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
    tempDbPath = path.join(os.tmpdir(), tmpName);
    process.env.PRICE_GETTER_DB_URL = `sqlite:////${tempDbPath.replace(/^\//, '')}`;

    const db = getDatabase();
    initDatabase(db);

    const hash = await hashPassword('pass1234');
    adminId = createUser(db, { username: 'admin_user', password_hash: hash, role: 'admin' }).id;
    user1Id = createUser(db, { username: 'user_one', password_hash: hash, role: 'viewer' }).id;
    user2Id = createUser(db, { username: 'user_two', password_hash: hash, role: 'viewer' }).id;

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

  it('isolates products by user_id and allows viewing public market items', () => {
    const db = getDatabase();

    // Admin creates public gold item
    addManagedProduct(db, {
      title: 'طلای ۱۸ عیار',
      url: 'https://example.com/gold',
      key: 'gold_18k',
      user_id: adminId,
      is_public: true,
    });

    // User 1 creates private product
    addManagedProduct(db, {
      title: 'گوشی سامسونگ A54',
      url: 'https://example.com/samsung-a54',
      key: 'samsung-a54',
      user_id: user1Id,
      is_public: false,
    });

    // User 2 creates private product
    addManagedProduct(db, {
      title: 'آیفون ۱۵ پرو',
      url: 'https://example.com/iphone-15',
      key: 'iphone-15',
      user_id: user2Id,
      is_public: false,
    });

    // User 1 should see: gold_18k (public) and samsung-a54 (own)
    const u1Prods = getManagedProducts(db, { userId: user1Id, isAdmin: false });
    const u1Keys = u1Prods.map((p) => p.key);
    expect(u1Keys).toContain('gold_18k');
    expect(u1Keys).toContain('samsung-a54');
    expect(u1Keys).not.toContain('iphone-15');

    // User 2 should see: gold_18k (public) and iphone-15 (own)
    const u2Prods = getManagedProducts(db, { userId: user2Id, isAdmin: false });
    const u2Keys = u2Prods.map((p) => p.key);
    expect(u2Keys).toContain('gold_18k');
    expect(u2Keys).toContain('iphone-15');
    expect(u2Keys).not.toContain('samsung-a54');

    // Admin should see ALL products
    const adminProds = getManagedProducts(db, { isAdmin: true });
    const adminKeys = adminProds.map((p) => p.key);
    expect(adminKeys).toContain('gold_18k');
    expect(adminKeys).toContain('samsung-a54');
    expect(adminKeys).toContain('iphone-15');

    db.close();
  });

  it('prevents non-owner from updating or deleting another users product or public item', () => {
    const db = getDatabase();

    addManagedProduct(db, {
      title: 'سکه امامی',
      url: 'https://example.com/sekkeh',
      key: 'sekkeh_emami',
      user_id: adminId,
      is_public: true,
    });

    addManagedProduct(db, {
      title: 'هدفون سونی',
      url: 'https://example.com/sony-headphones',
      key: 'sony-headphones',
      user_id: user1Id,
      is_public: false,
    });

    // User 1 updating their own product -> success
    expect(() => {
      updateManagedProduct(
        db,
        'sony-headphones',
        { title: 'هدفون سونی وایرلس', url: 'https://example.com/sony-headphones-2' },
        { id: user1Id, role: 'viewer' }
      );
    }).not.toThrow();

    // User 2 trying to update User 1's product -> throws
    expect(() => {
      updateManagedProduct(
        db,
        'sony-headphones',
        { title: 'هک شده', url: 'https://example.com/hacked' },
        { id: user2Id, role: 'viewer' }
      );
    }).toThrow(/دسترسی غیرمجاز/);

    // User 1 trying to update public item -> throws
    expect(() => {
      updateManagedProduct(
        db,
        'sekkeh_emami',
        { title: 'سکه تغییر یافته', url: 'https://example.com/sekkeh-2' },
        { id: user1Id, role: 'viewer' }
      );
    }).toThrow(/محصولات عمومی/);

    // User 2 trying to delete User 1's product -> throws
    expect(() => {
      deleteManagedProduct(db, 'sony-headphones', { id: user2Id, role: 'viewer' });
    }).toThrow(/دسترسی غیرمجاز/);

    // User 1 trying to delete public item -> throws
    expect(() => {
      deleteManagedProduct(db, 'sekkeh_emami', { id: user1Id, role: 'viewer' });
    }).toThrow(/محصولات عمومی/);

    // Admin can update public item or user product
    expect(() => {
      updateManagedProduct(
        db,
        'sekkeh_emami',
        { title: 'سکه تمام بهار آزادی', url: 'https://example.com/sekkeh-3' },
        { id: adminId, role: 'admin' }
      );
    }).not.toThrow();

    db.close();
  });
});
