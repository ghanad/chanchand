import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, setManagedProductEnabled } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const db = getDatabase();
    const result = setManagedProductEnabled(db, decodeURIComponent(key), false, auth.user);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
