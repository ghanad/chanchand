let activeRunId: number | null = null;
let activeTargetCount = 0;
let isRunning = false;

export function isRunActive(): boolean {
  return isRunning;
}

export function getActiveRunInfo() {
  return {
    run_id: activeRunId,
    target_count: activeTargetCount,
    is_running: isRunning,
  };
}

export function acquireRunLock(runId: number, targetCount: number): boolean {
  if (isRunning) {
    return false;
  }
  isRunning = true;
  activeRunId = runId;
  activeTargetCount = targetCount;
  return true;
}

export function releaseRunLock(): void {
  isRunning = false;
  activeRunId = null;
  activeTargetCount = 0;
}
