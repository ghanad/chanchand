import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, addManagedProduct, getManagedTargets } from '@/lib/db';
import { backfillDigikalaPriceHistory } from '@/lib/digikalaHistory';
import { requireAdmin } from '@/lib/api-guard';
import { validateSafeUrl } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    if (!body || !body.title || !body.url) {
      return NextResponse.json({ error: 'عنوان (title) و آدرس (url) الزامی هستند.' }, { status: 400 });
    }

    const urlCheck = validateSafeUrl(body.url);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: `آدرس نامعتبر یا غیرمجاز است: ${urlCheck.reason}` }, { status: 400 });
    }

    const db = getDatabase();
    const result = addManagedProduct(db, {
      title: body.title,
      url: body.url,
      source_key: body.source_key,
      user_id: auth.user.id,
      is_public: body.is_public !== undefined ? Boolean(body.is_public) : true,
      show_usd_chart: body.show_usd_chart !== undefined ? Boolean(body.show_usd_chart) : false,
      show_gold_chart: body.show_gold_chart !== undefined ? Boolean(body.show_gold_chart) : false,
      color_id: body.color_id ?? null,
      color_label: body.color_label ?? null,
    });

    if (!result.reused) {
      const target = getManagedTargets(db).find((t) => t.product_key === result.product_key);
      const backfill = await backfillDigikalaPriceHistory(db, {
        productKey: result.product_key,
        url: body.url,
        sourceKey: target?.source_key ?? body.source_key ?? 'digikala_api',
        colorId: target?.color_id ?? body.color_id ?? null,
        colorLabel: target?.color_label ?? body.color_label ?? null,
      });
      return NextResponse.json({ ...result, history_backfill: backfill });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
