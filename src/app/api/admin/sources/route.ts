import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, addManagedSource } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.key || !body.adapter) {
      return NextResponse.json({ error: 'key and adapter are required' }, { status: 400 });
    }

    const db = getDatabase();
    const result = addManagedSource(db, {
      key: body.key,
      adapter: body.adapter,
      timeout_seconds: body.timeout_seconds ? Number(body.timeout_seconds) : undefined,
      rate_limit_seconds: body.rate_limit_seconds ? Number(body.rate_limit_seconds) : undefined,
      currency: body.currency,
      price_multiplier: body.price_multiplier ? Number(body.price_multiplier) : undefined,
      headers: body.headers,
      settings: body.settings,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
