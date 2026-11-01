import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { chargeUserWallet, getDatabase, getUserById, getUserQuota } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'دسترسی غیرمجاز. فقط مدیران مجاز هستند.' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const userId = parseInt(rawId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'شناسه کاربر نامعتبر است.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    const description = body?.description ? String(body.description).trim() : undefined;
    const type = body?.type === 'admin_adjustment' ? 'admin_adjustment' : 'admin_charge';

    if (isNaN(amount) || amount === 0) {
      return NextResponse.json({ error: 'مبلغ شارژ نمی‌تواند صفر یا خالی باشد.' }, { status: 400 });
    }

    const db = getDatabase();
    const existing = getUserById(db, userId);
    if (!existing) {
      return NextResponse.json({ error: 'کاربر مورد نظر یافت نشد.' }, { status: 404 });
    }

    const result = chargeUserWallet(db, {
      userId,
      amount,
      description,
      type,
    });

    const quota = getUserQuota(db, userId, existing.role === 'admin');

    return NextResponse.json({
      success: true,
      message: `کیف پول با موفقیت ${amount > 0 ? 'شارژ' : 'کسر'} شد.`,
      balance: result.balance,
      transaction: result.transaction,
      quota,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطا در شارژ کیف پول' }, { status: 400 });
  }
}
