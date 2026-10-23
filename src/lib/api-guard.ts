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
