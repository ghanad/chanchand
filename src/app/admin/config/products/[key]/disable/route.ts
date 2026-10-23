import { NextRequest, NextResponse } from 'next/server';
import { disableProduct } from '@/lib/configEditor';
import { resolveConfigPath } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const configPath = resolveConfigPath();
    const result = disableProduct(configPath, key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
