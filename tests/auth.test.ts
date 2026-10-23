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

  it('signs and verifies JWT tokens', async () => {
    const payload = { id: 42, username: 'tester', role: 'admin' as const };
    const token = await signAuthToken(payload);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const decoded = await verifyAuthToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(42);
    expect(decoded?.username).toBe('tester');
    expect(decoded?.role).toBe('admin');

    const invalidDecoded = await verifyAuthToken('invalid.token.here');
    expect(invalidDecoded).toBeNull();
  });

  it('manages users in SQLite database', async () => {
    const db = new Database(':memory:');
    initDatabase(db);

    expect(countUsers(db)).toBe(0);

    // Ensure default admin
    const admin = await ensureDefaultAdmin(db);
    expect(admin).not.toBeNull();
    expect(admin?.username).toBe('admin');
    expect(admin?.role).toBe('admin');
    expect(countUsers(db)).toBe(1);
    expect(countAdmins(db)).toBe(1);

    // Calling ensureDefaultAdmin again does nothing
    const secondAdmin = await ensureDefaultAdmin(db);
    expect(secondAdmin).toBeNull();

    // Create viewer
    const viewerHash = await hashPassword('viewer123');
    const viewer = createUser(db, {
      username: 'viewer1',
      password_hash: viewerHash,
      role: 'viewer',
      email: 'viewer1@example.com',
    });
    expect(viewer.id).toBeGreaterThan(0);
    expect(viewer.role).toBe('viewer');
    expect(countUsers(db)).toBe(2);

    // Retrieve by username and id
    const foundUser = getUserByUsername(db, 'viewer1');
    expect(foundUser).not.toBeNull();
    expect(foundUser?.email).toBe('viewer1@example.com');

    const foundById = getUserById(db, viewer.id);
    expect(foundById?.username).toBe('viewer1');

    // List users
    const users = listUsers(db);
    expect(users.length).toBe(2);
    expect(users.some((u) => u.username === 'admin')).toBe(true);
    expect(users.some((u) => u.username === 'viewer1')).toBe(true);

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
});
