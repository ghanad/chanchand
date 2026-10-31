import { NextRequest, NextResponse } from 'next/server';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun } from '@/lib/db';
import { requireAdminOrApiKey } from '@/lib/api-guard';
import { TargetConfig } from '@/lib/types';
import { acquireRunLock, releaseRunLock, getActiveRunInfo } from '@/lib/run-lock';

export const dynamic = 'force-dynamic';

async function handleTrigger(req: NextRequest) {
  try {
    const auth = await requireAdminOrApiKey(req);
    if (!auth.authorized) {
      return auth.response;
    }

    let productKey: string | null = null;
    let force = true; // Default to true so OS cron executes fresh fetches

    // Try reading body for POST requests
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && typeof body.product_key === 'string' && body.product_key.trim()) {
          productKey = body.product_key.trim();
        }
        if (body && typeof body.force === 'boolean') {
          force = body.force;
        }
      } catch {
        // Body may be empty or not JSON
      }
    }

    // Query parameters override / fallback
    const queryProductKey = req.nextUrl.searchParams.get('product_key');
    if (queryProductKey && queryProductKey.trim()) {
      productKey = queryProductKey.trim();
    }

    const queryForce = req.nextUrl.searchParams.get('force');
    if (queryForce !== null) {
      force = queryForce === 'true' || queryForce === '1';
    }

    const activeInfo = getActiveRunInfo();
    if (activeInfo.is_running && activeInfo.run_id !== null) {
      return NextResponse.json(
        {
          error: 'فرآیند دیگری در حال حاضر در حال اجراست.',
          status: 'running',
          active_run_id: activeInfo.run_id,
          active_target_count: activeInfo.target_count,
        },
        { status: 409 }
      );
    }

    const db = getDatabase();
    const managedTargets = getManagedTargets(db);

    let candidateTargets = managedTargets;
    if (productKey) {
      candidateTargets = managedTargets.filter((t) => t.product_key === productKey);
      if (candidateTargets.length === 0) {
        return NextResponse.json(
          { error: `هدفی برای محصول «${productKey}» یافت نشد.` },
          { status: 404 }
        );
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
      return NextResponse.json(
        { error: 'هیچ هدف فعالی برای جمع‌آوری قیمت وجود ندارد.' },
        { status: 400 }
      );
    }

    const runId = startRun(db, null, null, activeTargets);
    if (!acquireRunLock(runId, activeTargets.length)) {
      const current = getActiveRunInfo();
      return NextResponse.json(
        {
          error: 'فرآیند دیگری در حال حاضر در حال اجراست.',
          status: 'running',
          active_run_id: current.run_id,
          active_target_count: current.target_count,
        },
        { status: 409 }
      );
    }

    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    const runner = new PriceRunner();

    try {
      const summary = await runner.executeRun(null, runId, activeTargets, { force });
      const finishTime = Date.now();
      const finishedAt = new Date().toISOString();

      return NextResponse.json({
        ok: true,
        run_id: summary.run_id,
        status: summary.status,
        target_count: summary.target_count,
        success_count: summary.success_count,
        error_count: summary.error_count,
        duration_ms: finishTime - startTime,
        started_at: startedAt,
        finished_at: finishedAt,
        product_key: productKey || undefined,
        force,
      });
    } finally {
      releaseRunLock();
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || String(err), status: 'failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleTrigger(req);
}

export async function GET(req: NextRequest) {
  return handleTrigger(req);
}
