import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, productHistoryChronological } from '@/lib/db';
import { serializeHistoryPrices, USD_HISTORY_LIMIT, USD_PRODUCT_KEY } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const productKey = searchParams.get('product_key');
    if (!productKey) {
      return NextResponse.json({ error: 'product_key is required' }, { status: 400 });
    }

    const sourceKey = searchParams.get('source_key') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 200, 1), 1000) : 200;

    const db = getDatabase();
    const rows = productHistoryChronological(db, productKey, sourceKey, limit);
    const usdRows = productHistoryChronological(db, USD_PRODUCT_KEY, undefined, USD_HISTORY_LIMIT);

    return NextResponse.json({
      rows: serializeHistoryPrices(rows, usdRows),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
