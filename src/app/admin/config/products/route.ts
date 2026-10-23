import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, addManagedProduct } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.title || !body.url) {
      return NextResponse.json({ error: 'title and url are required' }, { status: 400 });
    }

    const db = getDatabase();
    const result = addManagedProduct(db, {
      title: body.title,
      url: body.url,
      source_key: body.source_key,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
