import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  initDatabase,
  createUser,
  getUserByUsername,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
  countUsers,
  countAdmins,
} from '../src/lib/db';
import {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  ensureDefaultAdmin,
} from '../src/lib/auth';

describe('auth module and user management', () => {
  it('hashes and verifies passwords correctly', async () => {
    const rawPass = 'SecretPassword123!';
    const hash = await hashPassword(rawPass);
    expect(hash).not.toBe(rawPass);

    const matches = await verifyPassword(rawPass, hash);
    expect(matches).toBe(true);

    const wrongMatches = await verifyPassword('WrongPassword', hash);
    expect(wrongMatches).toBe(false);
  });

  it('signs and verifies JWT tokens including must_change_password', async () => {
    const payload = { id: 42, username: 'tester', role: 'admin' as const, must_change_password: true };
    const token = await signAuthToken(payload);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const decoded = await verifyAuthToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(42);
    expect(decoded?.username).toBe('tester');
    expect(decoded?.role).toBe('admin');
    expect(decoded?.must_change_password).toBe(true);

    const token2 = await signAuthToken({ id: 43, username: 'tester2', role: 'viewer' as const, must_change_password: false });
    const decoded2 = await verifyAuthToken(token2);
    expect(decoded2?.must_change_password).toBe(false);

    const invalidDecoded = await verifyAuthToken('invalid.token.here');
    expect(invalidDecoded).toBeNull();
  });

  it('manages users in SQLite database with must_change_password support', async () => {
    const db = new Database(':memory:');
    initDatabase(db);

    expect(countUsers(db)).toBe(0);

    // Ensure default admin
    const admin = await ensureDefaultAdmin(db);
    expect(admin).not.toBeNull();
    expect(admin?.username).toBe('admin');
    expect(admin?.role).toBe('admin');
    expect(admin?.must_change_password).toBe(false);
    expect(countUsers(db)).toBe(1);
    expect(countAdmins(db)).toBe(1);

    // Calling ensureDefaultAdmin again does nothing
    const secondAdmin = await ensureDefaultAdmin(db);
    expect(secondAdmin).toBeNull();

    // Create viewer with must_change_password: true
    const viewerHash = await hashPassword('viewer123');
    const viewer = createUser(db, {
      username: 'viewer1',
      password_hash: viewerHash,
      role: 'viewer',
      email: 'viewer1@example.com',
      must_change_password: true,
    });
    expect(viewer.id).toBeGreaterThan(0);
    expect(viewer.role).toBe('viewer');
    expect(viewer.must_change_password).toBe(true);
    expect(countUsers(db)).toBe(2);

    // Retrieve by username and id
    const foundUser = getUserByUsername(db, 'viewer1');
    expect(foundUser).not.toBeNull();
    expect(foundUser?.email).toBe('viewer1@example.com');
    expect(Boolean(foundUser?.must_change_password)).toBe(true);

    const foundById = getUserById(db, viewer.id);
    expect(foundById?.username).toBe('viewer1');
    expect(Boolean(foundById?.must_change_password)).toBe(true);

    // List users
    const users = listUsers(db);
    expect(users.length).toBe(2);
    const listedViewer = users.find((u) => u.username === 'viewer1');
    expect(listedViewer?.must_change_password).toBe(true);

    // Update must_change_password to false
    const updatedViewer = updateUser(db, viewer.id, { must_change_password: false });
    expect(updatedViewer.must_change_password).toBe(false);
    expect(Boolean(getUserById(db, viewer.id)?.must_change_password)).toBe(false);

    // Update viewer role
    const updated = updateUser(db, viewer.id, { role: 'admin' });
    expect(updated.role).toBe('admin');
    expect(countAdmins(db)).toBe(2);

    // Delete a user
    const deleted = deleteUser(db, viewer.id);
    expect(deleted).toBe(true);
    expect(countUsers(db)).toBe(1);

    // Cannot delete the only admin
    expect(() => deleteUser(db, admin!.id)).toThrow(/آخرین مدیر/);

    db.close();
  });

  it('migrates older users tables missing must_change_password column', () => {
    const db = new Database(':memory:');
    // Create users table without must_change_password column (legacy schema)
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(64) UNIQUE NOT NULL,
        email VARCHAR(128) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'viewer',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      );
    `);

    // Run initDatabase which contains auto-migration logic
    initDatabase(db);

    const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    expect(userColumns.some((col) => col.name === 'must_change_password')).toBe(true);

    db.close();
  });
});
