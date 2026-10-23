import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, updateManagedProduct, deleteManagedProduct } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import { validateSafeUrl } from '@/lib/security';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const body = await req.json();
    if (!body || !body.title || !body.url) {
      return NextResponse.json({ error: 'عنوان (title) و آدرس (url) الزامی هستند.' }, { status: 400 });
    }

    const urlCheck = validateSafeUrl(body.url);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: `آدرس نامعتبر یا غیرمجاز است: ${urlCheck.reason}` }, { status: 400 });
    }

    const db = getDatabase();
    const result = updateManagedProduct(
      db,
      decodeURIComponent(key),
      {
        title: body.title,
        url: body.url,
        source_key: body.source_key,
        is_public: auth.user.role === 'admin' && body.is_public !== undefined ? Boolean(body.is_public) : undefined,
      },
      auth.user
    );

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const db = getDatabase();
    const result = deleteManagedProduct(db, decodeURIComponent(key), auth.user);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
