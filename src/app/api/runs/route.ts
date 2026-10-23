import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, recentRuns } from '@/lib/db';
import { serializeRun } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100) : 20;

    const db = getDatabase();
    const rows = recentRuns(db, limit);

    return NextResponse.json({
      rows: rows.map((r) => serializeRun(r)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
