import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getSourcesMap } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import { validateSafeUrl } from '@/lib/security';
import { extractProductId } from '@/lib/adapters/digikalaApi';
import { buildDigikalaPreview, fetchDigikalaProduct } from '@/lib/digikalaProduct';
import { SourceConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FALLBACK_SOURCE: SourceConfig = {
  adapter: 'digikala_api',
  timeout_seconds: 10,
  rate_limit_seconds: 5,
  currency: 'IRR',
  price_multiplier: 1,
  headers: {},
  settings: {},
};

/**
 * Read-only preview of a product link, used by the "add product" modal so the
 * user can see the title, the live price and the colours before committing.
 * Only Digikala links are previewable; every other source falls back to the
 * plain form (`supported: false`).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const rawUrl = req.nextUrl.searchParams.get('url')?.trim() ?? '';
    if (!rawUrl) {
      return NextResponse.json({ error: 'آدرس محصول الزامی است.' }, { status: 400 });
    }

    const urlCheck = validateSafeUrl(rawUrl);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: `آدرس نامعتبر یا غیرمجاز است: ${urlCheck.reason}` }, { status: 400 });
    }

    const isDigikala = /(^|\.)digikala\.com$/i.test(new URL(rawUrl).hostname);
    const productId = isDigikala ? extractProductId(rawUrl) : null;
    if (!isDigikala || !productId) {
      return NextResponse.json({ supported: false });
    }

    const db = getDatabase();
    const source = getSourcesMap(db)['digikala_api'] ?? FALLBACK_SOURCE;
    const timeoutMs = Math.max(5, Math.min(source.timeout_seconds || 10, 10)) * 1000;

    const product = await fetchDigikalaProduct(productId, source, timeoutMs);
    if (!product) {
      return NextResponse.json({
        supported: true,
        product_id: productId,
        error: 'دریافت اطلاعات محصول از دیجی‌کالا ممکن نشد.',
      });
    }

    return NextResponse.json({
      supported: true,
      ...buildDigikalaPreview(product, source, productId),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
