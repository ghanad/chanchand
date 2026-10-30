import { AppConfig, TargetConfig, SourceConfig, PriceObservation } from './types';
import {
  getDatabase,
  startRun,
  finishRun,
  markRunFailed,
  recordPrice,
  recordError,
  hasSuccessfulPriceToday,
  getManagedTargets,
  getSourcesMap,
} from './db';
import { getAdapter } from './adapters';
import { loadConfig } from './config';
import { USD_PRODUCT_KEY } from './serializers';
import { normalizeTargetUrl } from './urls';

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

  async run(config?: AppConfig | null, configPath?: string, customTargets?: TargetConfig[]): Promise<RunSummary> {
    const db = getDatabase(this.dbUrl);
    let targetsToRun = customTargets;
    if (!targetsToRun) {
      const managedTargets = getManagedTargets(db);
      if (managedTargets.length > 0) {
        targetsToRun = managedTargets.map((t) => {
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
      } else {
        targetsToRun = config?.targets || [];
      }
    }
    const runId = startRun(db, configPath || null, config, targetsToRun);
    return this.executeRun(config, runId, targetsToRun);
  }

  async executeRun(
    config: AppConfig | null | undefined,
    runId: number,
    targets?: TargetConfig[],
    options?: { force?: boolean }
  ): Promise<RunSummary> {
    const db = getDatabase(this.dbUrl);
    let successCount = 0;
    let errorCount = 0;
    const lastRequestAt: Record<string, number> = {};

    let candidateTargets = targets;
    if (!candidateTargets) {
      const managedTargets = getManagedTargets(db);
      if (managedTargets.length > 0) {
        candidateTargets = managedTargets.map((t) => {
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
      } else {
        candidateTargets = config?.targets || [];
      }
    }

    const activeTargets = candidateTargets.filter((t) => t.enabled);
    activeTargets.sort((a, b) => {
      const aIsUsd = a.product_key === USD_PRODUCT_KEY ? 0 : 1;
      const bIsUsd = b.product_key === USD_PRODUCT_KEY ? 0 : 1;
      return aIsUsd - bIsUsd;
    });
    console.log(`[Runner] run ${runId} started: ${activeTargets.length} active targets`);

    const sources = config?.sources || getSourcesMap(db);
    const fetchedObservations = new Map<string, PriceObservation>();

    try {
      for (const target of activeTargets) {
        const source = sources[target.source_key];
        if (!source) {
          console.warn(`[Runner] run ${runId}: source ${target.source_key} not found for target ${target.product_key}`);
          continue;
        }

        if (!options?.force && source.adapter !== 'brsapi_market' && hasSuccessfulPriceToday(db, target.product_key, undefined, target.url)) {
          console.log(`[Runner] run ${runId}: skipping ${target.product_key}/${target.source_key}, already collected today`);
          continue;
        }

        const normUrl = normalizeTargetUrl(target.url);
        if (normUrl && fetchedObservations.has(normUrl)) {
          const cachedObservation = fetchedObservations.get(normUrl)!;
          recordPrice(db, runId, target, cachedObservation);
          successCount++;
          console.log(
            `[Runner] run ${runId}: reused cached observation for ${target.product_key}/${target.source_key} price_irr=${cachedObservation.price_irr}`
          );
          continue;
        }

        // Enforce rate limiting
        await this.respectRateLimit(target.source_key, source.rate_limit_seconds, lastRequestAt);

        console.log(`[Runner] run ${runId}: fetching ${target.product_key}/${target.source_key}`);
        try {
          const adapter = getAdapter(source.adapter);
          const observation = await adapter.fetch({ source, target });

          if (normUrl) {
            fetchedObservations.set(normUrl, observation);
          }

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
