import * as jose from 'jose';
import { UserRole } from './types';

export const AUTH_COOKIE_NAME = 'pg_session';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'pg_secret_fallback_key_32bytes_min_length_for_hmac!!';
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
