import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, updateManagedSource, deleteManagedSource } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { SourceConfigSchema } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const body = await req.json();

    const partialSchema = SourceConfigSchema.partial();
    const parseResult = partialSchema.safeParse(body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return NextResponse.json({ error: `تنظیمات منبع نامعتبر است: ${details}` }, { status: 400 });
    }

    const validData = parseResult.data;
    const db = getDatabase();
    const result = updateManagedSource(db, key, {
      adapter: validData.adapter,
      timeout_seconds: validData.timeout_seconds,
      rate_limit_seconds: validData.rate_limit_seconds,
      currency: validData.currency,
      price_multiplier: validData.price_multiplier,
      headers: validData.headers,
      settings: validData.settings,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const db = getDatabase();
    const result = deleteManagedSource(db, key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
