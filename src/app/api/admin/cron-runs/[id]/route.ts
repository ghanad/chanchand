import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getRunDetails } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { serializeRun, serializeError } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const runId = parseInt(id, 10);
    if (isNaN(runId) || runId <= 0) {
      return NextResponse.json({ error: 'شناسه اجرا نامعتبر است.' }, { status: 400 });
    }

    const db = getDatabase();
    const details = getRunDetails(db, runId);
    if (!details) {
      return NextResponse.json({ error: `اجرای شماره ${runId} یافت نشد.` }, { status: 404 });
    }

    return NextResponse.json({
      run: serializeRun(details.run),
      snapshots: details.snapshots.map((s: any) => ({
        id: s.id,
        product_key: s.product_key,
        source_key: s.source_key,
        url: s.url,
        title: s.title,
        seller: s.seller,
        price_irr: s.price_irr,
        price_toman: s.price_irr ? Math.round(s.price_irr / 10) : null,
        availability: s.availability,
        observed_at: s.observed_at,
      })),
      errors: details.errors.map((e) => serializeError(e)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
