import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getCronRuns, getCronRunStats } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { serializeRun } from '@/lib/serializers';
import { getActiveRunInfo } from '@/lib/run-lock';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const sourceFilter = req.nextUrl.searchParams.get('source') || undefined;
    const statusFilter = req.nextUrl.searchParams.get('status') || undefined;

    const db = getDatabase();
    const rows = getCronRuns(db, limit, sourceFilter, statusFilter);
    const stats = getCronRunStats(db);

    const activeInfo = getActiveRunInfo();
    stats.is_active_running = activeInfo.is_running;
    stats.active_run_id = activeInfo.run_id;

    return NextResponse.json({
      stats: {
        ...stats,
        last_run: stats.last_run ? serializeRun(stats.last_run) : null,
      },
      rows: rows.map((r) => serializeRun(r)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
