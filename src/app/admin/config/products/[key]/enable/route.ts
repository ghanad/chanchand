import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, setManagedProductEnabled } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const db = getDatabase();
    const result = setManagedProductEnabled(db, key, true);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
