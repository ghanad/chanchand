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

    const targetConfigs: TargetConfig[] = managedTargets.map((t) => {
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

    const runId = startRun(db, null, null, activeTargets, undefined, 'api', {
      initiated_by: auth.user.username,
      test_trigger: true,
      note: 'اجرای تست ادمین از صفحه وضعیت کرون',
    });

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
      const summary = await runner.executeRun(null, runId, activeTargets, { force: true });
      const finishTime = Date.now();
      const finishedAt = new Date().toISOString();

      return NextResponse.json({
        ok: true,
        run_id: summary.run_id,
        status: summary.status,
        trigger_source: 'api',
        target_count: summary.target_count,
        success_count: summary.success_count,
        error_count: summary.error_count,
        duration_ms: finishTime - startTime,
        started_at: startedAt,
        finished_at: finishedAt,
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
