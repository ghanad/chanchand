import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, updateUserProfile } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json().catch(() => ({}));
    const email = body.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
    const mobile = body.mobile !== undefined ? (body.mobile ? String(body.mobile).trim() : null) : undefined;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'فرمت آدرس ایمیل نامعتبر است.' }, { status: 400 });
    }

    if (mobile && !/^09\d{9}$/.test(mobile.replace(/\s+/g, ''))) {
      return NextResponse.json({ error: 'شماره موبایل نامعتبر است. لطفاً شماره را مانند ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.' }, { status: 400 });
    }

    const db = getDatabase();
    const updated = updateUserProfile(db, auth.user.id, { email, mobile });

    return NextResponse.json({
      success: true,
      message: 'مشخصات حساب کاربری با موفقیت ذخیره شد.',
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        mobile: updated.mobile,
        role: updated.role,
      },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed: users.email')) {
      return NextResponse.json({ error: 'این آدرس ایمیل توسط کاربر دیگری ثبت شده است.' }, { status: 409 });
    }
    return NextResponse.json(
      { error: err.message || 'خطا در به‌روزرسانی مشخصات حساب' },
      { status: 500 }
    );
  }
}
