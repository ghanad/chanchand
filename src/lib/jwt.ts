import * as jose from 'jose';
import { UserRole } from './types';

export const AUTH_COOKIE_NAME = 'pg_session';

let devWarningLogged = false;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'SECURITY ALERT: JWT_SECRET environment variable is required in production mode. Refusing to run with insecure default.'
      );
    }
    if (!devWarningLogged && process.env.NODE_ENV !== 'test') {
      console.warn(
        '[Security Warning] JWT_SECRET is not set. Using an insecure fallback secret for development only. Do not deploy to production without setting JWT_SECRET!'
      );
      devWarningLogged = true;
    }
    return new TextEncoder().encode('pg_secret_fallback_key_32bytes_min_length_for_hmac!!');
  }

  if (secret.length < 32) {
    if (isProduction) {
      throw new Error('SECURITY ALERT: JWT_SECRET must be at least 32 characters long for secure HS256 encryption.');
    }
  }

  return new TextEncoder().encode(secret);
}

export interface SessionTokenPayload {
  id: number;
  username: string;
  role: UserRole;
}

export async function signAuthToken(payload: SessionTokenPayload): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    if (!payload.id || !payload.username || !payload.role) {
      return null;
    }
    return {
      id: Number(payload.id),
      username: String(payload.username),
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}
