import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, updateManagedSource, deleteManagedSource } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const body = await req.json();

    const db = getDatabase();
    const result = updateManagedSource(db, key, {
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const db = getDatabase();
    const result = deleteManagedSource(db, key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
