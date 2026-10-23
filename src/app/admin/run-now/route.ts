import { NextRequest, NextResponse } from 'next/server';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun } from '@/lib/db';
import { requireAdmin } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

// Global execution tracker
let activeRunId: number | null = null;
let activeTargetCount = 0;
let isRunning = false;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      return auth.response;
    }

    if (isRunning && activeRunId !== null) {
      return NextResponse.json({
        run_id: activeRunId,
        target_count: activeTargetCount,
        success_count: 0,
        error_count: 0,
        status: 'running',
      });
    }

    const db = getDatabase();
    const managedTargets = getManagedTargets(db);
    const activeTargets = managedTargets.filter((t) => t.enabled);
    const runId = startRun(db, null);

    isRunning = true;
    activeRunId = runId;
    activeTargetCount = activeTargets.length;

    // Execute in background
    const runner = new PriceRunner();
    runner
      .executeRun(null, runId)
      .catch((err) => {
        console.error('[RunNow] background run error:', err);
      })
      .finally(() => {
        isRunning = false;
        activeRunId = null;
      });

    return NextResponse.json({
      run_id: runId,
      target_count: activeTargetCount,
      success_count: 0,
      error_count: 0,
      status: 'running',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 400 });
  }
}
