import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getUserPaymentTransactions } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const db = getDatabase();
    const transactions = getUserPaymentTransactions(db, auth.user.id, 100);

    return NextResponse.json({ transactions });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در دریافت تاریخچه پرداخت‌ها' },
      { status: 500 }
    );
  }
}
