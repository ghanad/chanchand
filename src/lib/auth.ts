import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { SafeUser } from './types';
import { countUsers, createUser } from './db';
import { AUTH_COOKIE_NAME, SessionTokenPayload, verifyAuthToken } from './jwt';

export * from './jwt';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAuthUserFromRequest(req: NextRequest): Promise<SessionTokenPayload | null> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function ensureDefaultAdmin(db: Database.Database): Promise<SafeUser | null> {
  try {
    if (countUsers(db) > 0) {
      return null;
    }

    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123456';
    const passwordHash = await hashPassword(initialPassword);

    const admin = createUser(db, {
      username,
      password_hash: passwordHash,
      role: 'admin',
      email: null,
    });

    console.log(`[Auth] Default admin account created with username: "${username}"`);
    return admin;
  } catch (err) {
    console.error('[Auth] Failed to initialize default admin user:', err);
    return null;
  }
}
