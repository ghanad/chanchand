import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, addManagedSource } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { SourceConfigSchema } from '@/lib/config';

export const dynamic = 'force-dynamic';

const KEY_RE = /^[A-Za-z0-9_.-]+$/;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    if (!body || !body.key || !body.adapter) {
      return NextResponse.json({ error: 'کلید (key) و آداپتور (adapter) الزامی هستند.' }, { status: 400 });
    }

    const key = String(body.key).trim();
    if (!KEY_RE.test(key)) {
      return NextResponse.json(
        { error: 'کلید منبع فقط می‌تواند شامل حروف انگلیسی، اعداد، خط فاصله، زیرخط و نقطه باشد.' },
        { status: 400 }
      );
    }

    const parseResult = SourceConfigSchema.safeParse(body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return NextResponse.json({ error: `تنظیمات منبع نامعتبر است: ${details}` }, { status: 400 });
    }

    const validData = parseResult.data;
    const db = getDatabase();
    const result = addManagedSource(db, {
      key,
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
