import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  getAuthUserFromRequest,
  hashPassword,
  signAuthToken,
} from '@/lib/auth';
import { getDatabase, getUserById, updateUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'برای تغییر کلمه عبور ابتدا باید وارد شوید.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const newPassword = body?.newPassword;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'کلمه عبور جدید باید حداقل شامل ۶ کاراکتر باشد.' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const user = getUserById(db, session.id);
    if (!user) {
      return NextResponse.json({ error: 'حساب کاربری یافت نشد.' }, { status: 404 });
    }

    const newPasswordHash = await hashPassword(newPassword);
    const updated = updateUser(db, user.id, {
      password_hash: newPasswordHash,
      must_change_password: false,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const newToken = await signAuthToken({
      id: updated.id,
      username: updated.username,
      role: updated.role,
      must_change_password: false,
    });

    const response = NextResponse.json({
      success: true,
      message: 'کلمه عبور با موفقیت تغییر یافت.',
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        must_change_password: false,
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در تغییر کلمه عبور.' },
      { status: 500 }
    );
  }
}
