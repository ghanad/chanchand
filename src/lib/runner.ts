import { AppConfig, TargetConfig, SourceConfig } from './types';
import { getDatabase, startRun, finishRun, markRunFailed, recordPrice, recordError, hasSuccessfulPriceToday } from './db';
import { getAdapter } from './adapters';
import { loadConfig } from './config';

export interface RunSummary {
  run_id: number;
  target_count: number;
  success_count: number;
  error_count: number;
  status: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PriceRunner {
  private dbUrl?: string;

  constructor(dbUrl?: string) {
    this.dbUrl = dbUrl;
  }

  runConfigFile(configPath: string): Promise<RunSummary> {
    const config = loadConfig(configPath);
    return this.run(config, configPath);
  }

  async run(config: AppConfig, configPath?: string): Promise<RunSummary> {
    const db = getDatabase(this.dbUrl);
    const runId = startRun(db, configPath || null, config);
    return this.executeRun(config, runId);
  }

  async executeRun(config: AppConfig, runId: number): Promise<RunSummary> {
    const db = getDatabase(this.dbUrl);
    let successCount = 0;
    let errorCount = 0;
    const lastRequestAt: Record<string, number> = {};

    const activeTargets = config.targets.filter((t) => t.enabled);
    console.log(`[Runner] run ${runId} started: ${activeTargets.length} active targets`);

    try {
      for (const target of activeTargets) {
        const source = config.sources[target.source_key];
        if (!source) {
          console.warn(`[Runner] run ${runId}: source ${target.source_key} not found for target ${target.product_key}`);
          continue;
        }

        if (source.adapter !== 'brsapi_market' && hasSuccessfulPriceToday(db, target.product_key)) {
          console.log(`[Runner] run ${runId}: skipping ${target.product_key}/${target.source_key}, already collected today`);
          continue;
        }

        // Enforce rate limiting
        await this.respectRateLimit(target.source_key, source.rate_limit_seconds, lastRequestAt);

        console.log(`[Runner] run ${runId}: fetching ${target.product_key}/${target.source_key}`);
        try {
          const adapter = getAdapter(source.adapter);
          const observation = await adapter.fetch({ source, target });

          recordPrice(db, runId, target, observation);
          successCount++;
          console.log(
            `[Runner] run ${runId}: collected ${target.product_key}/${target.source_key} price_irr=${observation.price_irr}`
          );
        } catch (err: any) {
          recordError(db, runId, target, err);
          errorCount++;
          console.warn(`[Runner] run ${runId}: failed ${target.product_key}/${target.source_key}:`, err.message || err);
        } finally {
          lastRequestAt[target.source_key] = Date.now();
        }
      }

      finishRun(db, runId, successCount, errorCount, activeTargets.length);
    } catch (err) {
      console.error(`[Runner] run ${runId} aborted unexpectedly:`, err);
      try {
        markRunFailed(db, runId);
      } catch (markErr) {
        console.error(`[Runner] failed to mark run ${runId} as failed:`, markErr);
      }
      throw err;
    }

    const runRow = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
    console.log(
      `[Runner] run ${runId} finished: status=${runRow.status} success=${successCount} errors=${errorCount}`
    );

    return {
      run_id: runId,
      target_count: runRow.target_count,
      success_count: successCount,
      error_count: errorCount,
      status: runRow.status,
    };
  }

  private async respectRateLimit(
    sourceKey: string,
    rateLimitSeconds: number,
    lastRequestAt: Record<string, number>
  ): Promise<void> {
    if (rateLimitSeconds <= 0) return;
    const last = lastRequestAt[sourceKey];
    if (last) {
      const elapsed = (Date.now() - last) / 1000;
      const waitTime = rateLimitSeconds - elapsed;
      if (waitTime > 0) {
        await sleep(waitTime * 1000);
      }
    }
  }
}
