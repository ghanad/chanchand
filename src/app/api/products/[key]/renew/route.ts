import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, isUserTrackingProduct, renewProductSlot, getUserQuota } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

/**
 * Start a fresh 30-day window on a product whose paid slot has lapsed. Consumes
 * one purchased slot credit from the wallet pool.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const productKey = decodeURIComponent(key);

    const db = getDatabase();
    if (auth.user.role !== 'admin' && !isUserTrackingProduct(db, auth.user.id, productKey)) {
      return NextResponse.json({ error: 'این محصول در فهرست محصولات شما نیست.' }, { status: 403 });
    }

    const result = renewProductSlot(db, auth.user.id, productKey);
    const quota = getUserQuota(db, auth.user.id, auth.user.role === 'admin');

    return NextResponse.json({
      success: true,
      message: 'پنجره پایش این محصول برای ۳۰ روز دیگر فعال شد.',
      ...result,
      quota,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
