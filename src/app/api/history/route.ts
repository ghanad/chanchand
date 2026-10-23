import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, productHistoryChronological } from '@/lib/db';
import { serializeHistoryPrices, USD_HISTORY_LIMIT, USD_PRODUCT_KEY } from '@/lib/serializers';

import { getAuthUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    const searchParams = req.nextUrl.searchParams;
    const productKey = searchParams.get('product_key');
    if (!productKey) {
      return NextResponse.json({ error: 'product_key is required' }, { status: 400 });
    }

    const db = getDatabase();

    if (user && user.role !== 'admin' && productKey !== USD_PRODUCT_KEY) {
      const prod = db.prepare('SELECT user_id, is_public FROM managed_products WHERE key = ?').get(productKey) as
        | { user_id: number | null; is_public: number }
        | undefined;
      if (prod && prod.user_id !== user.id && prod.is_public !== 1) {
        return NextResponse.json(
          { error: 'دسترسی غیرمجاز: شما اجازه دسترسی به تاریخچه این محصول را ندارید.' },
          { status: 403 }
        );
      }
    }

    const sourceKey = searchParams.get('source_key') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 200, 1), 1000) : 200;

    const rows = productHistoryChronological(db, productKey, sourceKey, limit);
    const usdRows = productHistoryChronological(db, USD_PRODUCT_KEY, undefined, USD_HISTORY_LIMIT);

    return NextResponse.json({
      rows: serializeHistoryPrices(rows, usdRows),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
