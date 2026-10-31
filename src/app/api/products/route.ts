import { NextRequest, NextResponse } from 'next/server';
import {
  getDatabase,
  getManagedProducts,
  getManagedTargets,
  getManagedSources,
  sourcesFromLatestRun,
  addManagedProduct,
} from '@/lib/db';
import { productsPayload, sourcesPayload } from '@/lib/serializers';
import { getAuthUserFromRequest } from '@/lib/auth';
import { requireAuth } from '@/lib/api-guard';
import { validateSafeUrl } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    const db = getDatabase();

    const filter = user ? { userId: user.id, isAdmin: user.role === 'admin' } : undefined;
    const dbProducts = getManagedProducts(db, filter);
    const allowedKeys = user && user.role !== 'admin' ? new Set(dbProducts.map((p) => p.key)) : null;
    const allTargets = getManagedTargets(db);
    const dbTargets = allowedKeys ? allTargets.filter((t) => allowedKeys.has(t.product_key)) : allTargets;
    const managedSources = getManagedSources(db);
    const dbSources = sourcesFromLatestRun(db);

    return NextResponse.json({
      products: productsPayload(null, dbProducts, dbTargets, user),
      sources: sourcesPayload(null, dbSources, managedSources),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
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

    const isPublic = auth.user.role === 'admin' ? Boolean(body.is_public) : false;

    const db = getDatabase();
    const result = addManagedProduct(db, {
      title: body.title,
      url: body.url,
      source_key: body.source_key,
      user_id: auth.user.id,
      is_public: isPublic,
      adapter_settings: body.adapter_settings,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}

