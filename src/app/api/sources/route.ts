import { NextResponse } from 'next/server';
import { getDatabase, getManagedSources } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDatabase();
    const rows = getManagedSources(db);

    const counts = db
      .prepare(`
        SELECT source_key,
               COUNT(*) as target_count,
               SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled_target_count,
               COUNT(DISTINCT product_key) as product_count
        FROM managed_targets
        GROUP BY source_key
      `)
      .all() as Array<{
        source_key: string;
        target_count: number;
        enabled_target_count: number;
        product_count: number;
      }>;

    const countMap = new Map(counts.map((c) => [c.source_key, c]));

    const enrichedSources = rows.map((s) => {
      const stat = countMap.get(s.key);
      return {
        key: s.key,
        adapter: s.adapter,
        configured: true,
        timeout_seconds: s.timeout_seconds,
        rate_limit_seconds: s.rate_limit_seconds,
        currency: s.currency,
        price_multiplier: s.price_multiplier,
        target_count: stat?.target_count || 0,
        enabled_target_count: stat?.enabled_target_count || 0,
        product_count: stat?.product_count || 0,
        created_at: s.created_at,
        updated_at: s.updated_at,
      };
    });

    return NextResponse.json({ sources: enrichedSources });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
