import { NextRequest, NextResponse } from 'next/server';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import { TargetConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { key } = await params;
    const productKey = decodeURIComponent(key);

    const db = getDatabase();
    const prod = db.prepare('SELECT user_id, is_public FROM managed_products WHERE key = ?').get(productKey) as
      | { user_id: number | null; is_public: number }
      | undefined;

    if (!prod) {
      return NextResponse.json(
        { error: `محصولی با شناسه «${productKey}» یافت نشد.` },
        { status: 404 }
      );
    }

    if (auth.user.role !== 'admin' && prod.user_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'دسترسی غیرمجاز: کاربران عادی فقط مجاز به استعلام دستی محصولات اختصاصی خود هستند.' },
        { status: 403 }
      );
    }

    const managedTargets = getManagedTargets(db);
    const candidateTargets = managedTargets.filter((t) => t.product_key === productKey);

    if (candidateTargets.length === 0) {
      return NextResponse.json(
        { error: `هدفی برای محصول «${productKey}» یافت نشد.` },
        { status: 404 }
      );
    }

    const targetConfigs: TargetConfig[] = candidateTargets.map((t) => {
      let adapterSettings: Record<string, any> = {};
      try {
        adapterSettings = JSON.parse(t.adapter_settings || '{}');
      } catch {}
      return {
        product_key: t.product_key,
        source_key: t.source_key,
        url: t.url,
        enabled: Boolean(t.enabled),
        adapter_settings: adapterSettings,
      };
    });

    const activeTargets = targetConfigs.filter((t) => t.enabled);
    if (activeTargets.length === 0) {
      return NextResponse.json(
        { error: 'هیچ هدف فعالی برای استعلام این محصول وجود ندارد.' },
        { status: 400 }
      );
    }

    const runId = startRun(db, null, null, activeTargets);
    const runner = new PriceRunner();
    const summary = await runner.executeRun(null, runId, activeTargets, { force: true });

    return NextResponse.json({
      run_id: runId,
      target_count: summary.target_count,
      success_count: summary.success_count,
      error_count: summary.error_count,
      status: summary.status,
      product_key: productKey,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
