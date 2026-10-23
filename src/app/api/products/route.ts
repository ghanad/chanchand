import { NextResponse } from 'next/server';
import { getDatabase, getManagedProducts, getManagedTargets, sourcesFromLatestRun } from '@/lib/db';
import { loadConfig } from '@/lib/config';
import { productsPayload, sourcesPayload } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = loadConfig();
    const db = getDatabase();
    const dbProducts = getManagedProducts(db);
    const dbTargets = getManagedTargets(db);
    const dbSources = sourcesFromLatestRun(db);

    return NextResponse.json({
      products: productsPayload(config, dbProducts, dbTargets),
      sources: sourcesPayload(config, dbSources),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

