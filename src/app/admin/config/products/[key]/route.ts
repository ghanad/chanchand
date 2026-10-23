import { NextRequest, NextResponse } from 'next/server';
import { updateProductTarget, deleteProduct } from '@/lib/configEditor';
import { resolveConfigPath } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const body = await req.json();
    if (!body || !body.title || !body.url) {
      return NextResponse.json({ error: 'title and url are required' }, { status: 400 });
    }

    const configPath = resolveConfigPath();
    const result = updateProductTarget(configPath, key, {
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
    const { key } = await params;
    const configPath = resolveConfigPath();
    const result = deleteProduct(configPath, key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
