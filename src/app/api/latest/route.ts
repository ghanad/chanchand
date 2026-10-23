import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getManagedProducts, getManagedTargets, latestSnapshots, recentRuns } from '@/lib/db';
import { productsPayload, serializePrice, serializeRun } from '@/lib/serializers';
import { getAuthUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    const db = getDatabase();

    const filter = user ? { userId: user.id, isAdmin: user.role === 'admin' } : undefined;
    const dbProducts = getManagedProducts(db, filter);
    const allowedKeys = user && user.role !== 'admin' ? new Set(dbProducts.map((p) => p.key)) : undefined;

    const rows = latestSnapshots(db, 100, allowedKeys);
    const runs = recentRuns(db, 1);
    const dbTargets = getManagedTargets(db);
    const products = productsPayload(null, dbProducts, dbTargets, user);

    const latestRunRow = runs.length > 0 ? serializeRun(runs[0]) : null;
    let latestObservedAt: string | null = null;
    for (const r of rows) {
      if (!latestObservedAt || r.observed_at > latestObservedAt) {
        latestObservedAt = r.observed_at;
      }
    }

    return NextResponse.json({
      summary: {
        product_count: products.length,
        latest_run: latestRunRow,
        latest_observed_at: latestObservedAt,
      },
      rows: rows.map((r) => serializePrice(r)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
