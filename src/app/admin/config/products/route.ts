import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, addManagedProduct } from '@/lib/db';
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
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
