import { NextRequest, NextResponse } from 'next/server';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';
import { TargetConfig } from '@/lib/types';
import { acquireRunLock, releaseRunLock, getActiveRunInfo } from '@/lib/run-lock';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    let productKey: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.product_key === 'string' && body.product_key.trim()) {
        productKey = body.product_key.trim();
      }
    } catch {
      // Body may be empty
    }

    if (!productKey) {
      const queryKey = req.nextUrl.searchParams.get('product_key');
      if (queryKey && queryKey.trim()) {
        productKey = queryKey.trim();
      }
    }

    const runInfo = getActiveRunInfo();
    if (runInfo.is_running && runInfo.run_id !== null) {
      return NextResponse.json({
        run_id: runInfo.run_id,
        target_count: runInfo.target_count,
        success_count: 0,
        error_count: 0,
        status: 'running',
        message: 'فرآیند دیگری در حال اجراست.',
      });
    }

    const db = getDatabase();
    const managedTargets = getManagedTargets(db);

    let candidateTargets = managedTargets;
    if (productKey) {
      candidateTargets = managedTargets.filter((t) => t.product_key === productKey);
      if (candidateTargets.length === 0) {
        return NextResponse.json({ error: `هدفی برای محصول «${productKey}» یافت نشد.` }, { status: 404 });
      }
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
      return NextResponse.json({ error: 'هیچ هدف فعالی برای این استعلام وجود ندارد.' }, { status: 400 });
    }

    const runId = startRun(db, null, null, activeTargets);
    const runner = new PriceRunner();

    if (!acquireRunLock(runId, activeTargets.length)) {
      const active = getActiveRunInfo();
      return NextResponse.json({
        run_id: active.run_id,
        target_count: active.target_count,
        success_count: 0,
        error_count: 0,
        status: 'running',
        message: 'فرآیند دیگری در حال اجراست.',
      });
    }

    // If specific product is requested, execute synchronously and return fresh result
    if (productKey) {
      try {
        const summary = await runner.executeRun(null, runId, activeTargets, { force: true });
        return NextResponse.json({
          run_id: runId,
          target_count: summary.target_count,
          success_count: summary.success_count,
          error_count: summary.error_count,
          status: summary.status,
          product_key: productKey,
        });
      } finally {
        releaseRunLock();
      }
    }

    // Otherwise, execute all targets in background
    runner
      .executeRun(null, runId, activeTargets)
      .catch((err) => {
        console.error('[RunNow] background run error:', err);
      })
      .finally(() => {
        releaseRunLock();
      });

    return NextResponse.json({
      run_id: runId,
      target_count: activeTargets.length,
      success_count: 0,
      error_count: 0,
      status: 'running',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
