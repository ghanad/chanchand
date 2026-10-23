import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, recentErrors } from '@/lib/db';
import { serializeError } from '@/lib/serializers';

import { getAuthUserFromRequest } from '@/lib/auth';
import { getManagedProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const db = getDatabase();
    let allowedKeys: string[] | undefined;
    if (user && user.role !== 'admin') {
      const userProducts = getManagedProducts(db, { userId: user.id, isAdmin: false });
      allowedKeys = userProducts.map((p) => p.key);
    }

    const rows = recentErrors(db, limit, allowedKeys);

    return NextResponse.json({
      rows: rows.map((r) => serializeError(r)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
