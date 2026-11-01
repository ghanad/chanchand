import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, getActivePackages } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const db = getDatabase();
    const packages = getActivePackages(db);

    return NextResponse.json({ packages });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'خطا در دریافت لیست بسته‌ها' },
      { status: 500 }
    );
  }
}
