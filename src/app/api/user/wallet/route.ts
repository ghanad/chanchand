import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import {
  getDatabase,
  getUserById,
  getUserQuota,
  getSlotPriceToman,
  getUserWalletTransactions,
  getUserSubscriptions,
} from '@/lib/db';

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
    const transactions = getUserWalletTransactions(db, user.id, 20);
    const subscriptions = getUserSubscriptions(db, user.id);
    const slotPrice = getSlotPriceToman();

    return NextResponse.json({
      wallet_balance: user.wallet_balance ?? 0,
      extra_slots: user.extra_slots ?? 0,
      slot_expires_at: user.slot_expires_at ?? null,
      slot_price: slotPrice,
      quota,
      transactions,
      subscriptions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در دریافت اطلاعات کیف پول' }, { status: 500 });
  }
}
