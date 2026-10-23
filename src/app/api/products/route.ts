import { NextResponse } from 'next/server';
import {
  getDatabase,
  getManagedProducts,
  getManagedTargets,
  getManagedSources,
  sourcesFromLatestRun,
} from '@/lib/db';
import { productsPayload, sourcesPayload } from '@/lib/serializers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDatabase();
    const dbProducts = getManagedProducts(db);
    const dbTargets = getManagedTargets(db);
    const managedSources = getManagedSources(db);
    const dbSources = sourcesFromLatestRun(db);

    return NextResponse.json({
      products: productsPayload(null, dbProducts, dbTargets),
      sources: sourcesPayload(null, dbSources, managedSources),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

