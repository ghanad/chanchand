import { NextRequest, NextResponse } from 'next/server';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun, getScheduledBatchTargets } from '@/lib/db';
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
    let force = false; // Default to false so daily collection is respected (skips targets already collected today)
    let explicitSource: string | null = null;
    let customLimit: number | undefined;
    let spread = true;
    let runsPerDay: number | undefined;

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
        if (body && typeof (body.source || body.trigger_source) === 'string') {
          explicitSource = (body.source || body.trigger_source).trim();
        }
        if (body && typeof body.limit === 'number' && body.limit > 0) {
          customLimit = Math.floor(body.limit);
        }
        if (body && typeof body.spread === 'boolean') {
          spread = body.spread;
        }
        if (body && typeof (body.runs_per_day || body.runsPerDay) === 'number') {
          runsPerDay = Math.floor(body.runs_per_day || body.runsPerDay);
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

    const querySource = req.nextUrl.searchParams.get('source') || req.nextUrl.searchParams.get('trigger_source') || req.headers.get('x-trigger-source');
    if (querySource && querySource.trim()) {
      explicitSource = querySource.trim();
    }

    const queryLimit = req.nextUrl.searchParams.get('limit');
    if (queryLimit && !isNaN(parseInt(queryLimit, 10)) && parseInt(queryLimit, 10) > 0) {
      customLimit = parseInt(queryLimit, 10);
    }

    const querySpread = req.nextUrl.searchParams.get('spread');
    if (querySpread !== null) {
      spread = querySpread === 'true' || querySpread === '1';
    }

    const queryRunsPerDay = req.nextUrl.searchParams.get('runs_per_day') || req.nextUrl.searchParams.get('runsPerDay');
    if (queryRunsPerDay && !isNaN(parseInt(queryRunsPerDay, 10))) {
      runsPerDay = parseInt(queryRunsPerDay, 10);
    }

    // Default trigger_source: if called with api_key, defaults to 'cron'; if called by admin session, defaults to 'api'
    const effectiveSource = explicitSource || (auth.type === 'api_key' ? 'cron' : 'api');

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

    // Determine the scheduled batch of targets to run
    let targetsToRun = activeTargets;
    let batchResult: any = null;

    if (!productKey) {
      batchResult = getScheduledBatchTargets(db, activeTargets, {
        limit: customLimit,
        force,
        spread,
        runsPerDay,
      });
      targetsToRun = batchResult.targets;
    }

    const triggerDetails = {
      auth_type: auth.type,
      user: (auth as any).user?.username || undefined,
      user_agent: req.headers.get('user-agent') || undefined,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || undefined,
      product_key: productKey || undefined,
      force,
      spread,
      limit: customLimit,
    };

    const runId = startRun(db, null, null, targetsToRun, undefined, effectiveSource, triggerDetails);
    if (!acquireRunLock(runId, targetsToRun.length)) {
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
      const summary = await runner.executeRun(null, runId, targetsToRun, { force });
      const finishTime = Date.now();
      const finishedAt = new Date().toISOString();

      return NextResponse.json({
        ok: true,
        run_id: summary.run_id,
        status: summary.status,
        trigger_source: effectiveSource,
        target_count: summary.target_count,
        success_count: summary.success_count,
        error_count: summary.error_count,
        batch_size: batchResult?.batchSize,
        total_eligible_today: batchResult?.totalEligibleNonMarket,
        remaining_today: batchResult?.remainingToday,
        total_public_targets: batchResult?.totalPublicTargets,
        eligible_public_targets: batchResult?.eligiblePublicTargets,
        total_private_targets: batchResult?.totalPrivateTargets,
        eligible_private_targets: batchResult?.eligiblePrivateTargets,
        is_public_collection_hour: batchResult?.isPublicCollectionHour,
        total_managed_targets: activeTargets.length,
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
