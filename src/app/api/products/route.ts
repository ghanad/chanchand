import { NextResponse } from 'next/server';
import { getDatabase, productsFromLatestRun, sourcesFromLatestRun } from '@/lib/db';
import { loadConfig } from '@/lib/config';
import { productsPayload, sourcesPayload } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = loadConfig();
    const db = getDatabase();
    const dbProducts = productsFromLatestRun(db);
    const dbSources = sourcesFromLatestRun(db);

    return NextResponse.json({
      products: productsPayload(config, dbProducts),
      sources: sourcesPayload(config, dbSources),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
