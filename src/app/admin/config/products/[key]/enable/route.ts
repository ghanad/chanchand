import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, setManagedProductEnabled } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const db = getDatabase();
    const result = setManagedProductEnabled(db, key, true);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
