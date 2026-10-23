import { NextResponse } from 'next/server';
import { getDatabase, getManagedSources } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDatabase();
    const rows = getManagedSources(db);
    return NextResponse.json({ sources: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
