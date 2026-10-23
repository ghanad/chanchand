import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, updateManagedProduct, deleteManagedProduct } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { validateSafeUrl } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireAdmin(req);
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
    const result = updateManagedProduct(db, key, {
      title: body.title,
      url: body.url,
      source_key: body.source_key,
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
    const result = deleteManagedProduct(db, key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
