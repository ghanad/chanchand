import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { PriceRunner } from '@/lib/runner';
import { getDatabase, getManagedTargets, startRun } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Global execution tracker
let activeRunId: number | null = null;
let activeTargetCount = 0;
let isRunning = false;

export async function POST() {
  try {
    if (isRunning && activeRunId !== null) {
      return NextResponse.json({
        run_id: activeRunId,
        target_count: activeTargetCount,
        success_count: 0,
        error_count: 0,
        status: 'running',
      });
    }

    const config = loadConfig();
    const db = getDatabase();
    const managedTargets = getManagedTargets(db);
    const activeTargets =
      managedTargets.length > 0
        ? managedTargets.filter((t) => t.enabled)
        : (config.targets || []).filter((t) => t.enabled);
    const runId = startRun(db, null, config);

    isRunning = true;
    activeRunId = runId;
    activeTargetCount = activeTargets.length;

    // Execute in background
    const runner = new PriceRunner();
    runner
      .executeRun(config, runId)
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
