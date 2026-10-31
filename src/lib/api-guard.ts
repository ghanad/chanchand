import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from './auth';
import { SessionTokenPayload } from './jwt';

export type AdminAuthResult =
  | { authorized: true; user: SessionTokenPayload }
  | { authorized: false; response: NextResponse };

/**
 * Validates that an incoming API request comes from an authenticated administrator.
 * Provides Defense-in-Depth for route handlers independent of middleware configuration.
 */
export async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const user = await getAuthUserFromRequest(req);

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'برای دسترسی ابتدا باید وارد سیستم شوید.' },
        { status: 401 }
      ),
    };
  }

  if (user.role !== 'admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'دسترسی غیرمجاز. این بخش فقط برای مدیران سیستم قابل دسترسی است.' },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, user };
}

/**
 * Validates that an incoming API request comes from an authenticated user (viewer or admin).
 */
export async function requireAuth(req: NextRequest): Promise<AdminAuthResult> {
  const user = await getAuthUserFromRequest(req);

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'برای دسترسی ابتدا باید وارد سیستم شوید.' },
        { status: 401 }
      ),
    };
  }

  return { authorized: true, user };
}

export type TriggerAuthResult =
  | { authorized: true; type: 'admin' | 'api_key'; user?: SessionTokenPayload }
  | { authorized: false; response: NextResponse };

/**
 * Validates that an incoming API request has a valid TRIGGER_API_KEY / CRON_SECRET,
 * or comes from an authenticated administrator session.
 */
export async function requireAdminOrApiKey(req: NextRequest): Promise<TriggerAuthResult> {
  const expectedKey = (process.env.TRIGGER_API_KEY || process.env.CRON_SECRET || '').trim();

  let providedKey: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      providedKey = match[1].trim();
    }
  }
  if (!providedKey) {
    providedKey = req.headers.get('x-api-key')?.trim() || null;
  }
  if (!providedKey) {
    providedKey = req.nextUrl.searchParams.get('key')?.trim() || req.nextUrl.searchParams.get('token')?.trim() || null;
  }

  if (expectedKey && providedKey) {
    const expectedBuf = Buffer.from(expectedKey);
    const providedBuf = Buffer.from(providedKey);
    if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return { authorized: true, type: 'api_key' };
    }
  }

  // Fallback to checking admin session cookie
  const user = await getAuthUserFromRequest(req);
  if (user && user.role === 'admin') {
    return { authorized: true, type: 'admin', user };
  }

  return {
    authorized: false,
    response: NextResponse.json(
      { error: 'دسترسی غیرمجاز. کلید احراز هویت (TRIGGER_API_KEY) یا ورود مدیر الزامی است.' },
      { status: 401 }
    ),
  };
}
