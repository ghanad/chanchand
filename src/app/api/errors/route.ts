import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, recentErrors } from '@/lib/db';
import { serializeError } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const db = getDatabase();
    const rows = recentErrors(db, limit);

    return NextResponse.json({
      rows: rows.map((r) => serializeError(r)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
