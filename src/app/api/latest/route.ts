import { NextResponse } from 'next/server';
import { getDatabase, latestSnapshots, productsFromLatestRun, recentRuns } from '@/lib/db';
import { loadConfig } from '@/lib/config';
import { productsPayload, serializePrice, serializeRun } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = loadConfig();
    const db = getDatabase();
    const rows = latestSnapshots(db);
    const runs = recentRuns(db, 1);
    const dbProducts = productsFromLatestRun(db);
    const products = productsPayload(config, dbProducts);

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
