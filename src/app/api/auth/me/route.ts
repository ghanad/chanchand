import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getDatabase, getUserById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'احراز هویت نشده‌اید.' }, { status: 401 });
    }

    const db = getDatabase();
    const user = getUserById(db, session.id);
    if (!user) {
      return NextResponse.json({ error: 'کاربر یافت نشد.' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در دریافت مشخصات کاربر' }, { status: 500 });
  }
}
