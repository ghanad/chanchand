import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, isUserTrackingProduct, transferProductSlot, getUserQuota } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

/**
 * Move the remaining window of this product's paid slot to another tracked
 * product. Allowed once per slot, so it cannot be used to extend capacity.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const fromKey = decodeURIComponent(key);
    const body = await req.json().catch(() => ({}));
    const toKey = typeof body?.to_key === 'string' ? body.to_key.trim() : '';

    if (!toKey) {
      return NextResponse.json({ error: 'شناسه محصول مقصد (to_key) الزامی است.' }, { status: 400 });
    }

    const db = getDatabase();
    if (auth.user.role !== 'admin') {
      if (!isUserTrackingProduct(db, auth.user.id, fromKey) || !isUserTrackingProduct(db, auth.user.id, toKey)) {
        return NextResponse.json({ error: 'هر دو محصول باید در فهرست شما باشند.' }, { status: 403 });
      }
    }

    const result = transferProductSlot(db, auth.user.id, fromKey, toKey);
    const quota = getUserQuota(db, auth.user.id, auth.user.role === 'admin');

    return NextResponse.json({
      success: true,
      message: 'پنجره پایش به محصول مقصد منتقل شد.',
      ...result,
      quota,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
