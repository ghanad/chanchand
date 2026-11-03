import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getDatabase, purchaseProductSlot } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'احراز هویت نشده‌اید.' }, { status: 401 });
    }

    const db = getDatabase();
    const result = purchaseProductSlot(db, {
      userId: session.id,
    });

    return NextResponse.json({
      success: true,
      message: 'شارژ ماهانه ۱ اسلات ظرفیت پایش (۳۰ روزه) با موفقیت فعال شد.',
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در خرید اسلات محصول' },
      { status: 400 }
    );
  }
}
