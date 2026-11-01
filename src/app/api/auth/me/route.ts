import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getDatabase, getUserById, getUserQuota, getSlotPriceToman } from '@/lib/db';

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

    const quota = getUserQuota(db, user.id, user.role === 'admin');

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mobile: user.mobile ?? null,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
        wallet_balance: user.wallet_balance ?? 0,
        extra_slots: user.extra_slots ?? 0,
        quota,
        slot_price: getSlotPriceToman(),
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در دریافت مشخصات کاربر' }, { status: 500 });
  }
}
