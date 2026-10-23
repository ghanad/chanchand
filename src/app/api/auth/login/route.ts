import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getUserByUsername } from '@/lib/db';
import {
  AUTH_COOKIE_NAME,
  ensureDefaultAdmin,
  signAuthToken,
  verifyPassword,
} from '@/lib/auth';
import { loginRateLimiter } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const forwarded = req.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    if (loginRateLimiter.isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: 'به دلیل تلاش‌های ناموفق مکرر، لطفاً چند دقیقه بعد مجدداً تلاش کنید.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const username = body?.username?.trim();
    const password = body?.password;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'نام کاربری و کلمه عبور الزامی است.' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    // Auto-bootstrap default admin if database is newly initialized
    await ensureDefaultAdmin(db);

    const user = getUserByUsername(db, username);
    if (!user) {
      loginRateLimiter.recordFailure(clientIp);
      return NextResponse.json(
        { error: 'نام کاربری یا کلمه عبور نادرست است.' },
        { status: 401 }
      );
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      loginRateLimiter.recordFailure(clientIp);
      return NextResponse.json(
        { error: 'نام کاربری یا کلمه عبور نادرست است.' },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful authentication
    loginRateLimiter.recordSuccess(clientIp);

    const token = await signAuthToken({
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: Boolean(user.must_change_password),
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در فرآیند ورود به سیستم.' },
      { status: 500 }
    );
  }
}
