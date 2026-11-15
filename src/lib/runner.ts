import type Database from 'better-sqlite3';
import { AppConfig, TargetConfig, SourceConfig, PriceObservation } from './types';
import {
  getDatabase,
  startRun,
  finishRun,
  markRunFailed,
  recordPrice,
  recordError,
  hasSuccessfulPriceToday,
  hasSuccessfulPriceThisHour,
  hasSuccessfulPriceWithinMinutes,
  getMarketPollIntervalMinutes,
  getTimezoneHour,
  getPublicProductKeys,
  getProductScheduleMap,
  isHourInWindow,
  isMarketSource,
  getManagedTargets,
  getSourcesMap,
} from './db';
import { getAdapter } from './adapters';
import { loadConfig } from './config';
import { USD_PRODUCT_KEY } from './serializers';
import { normalizeTargetUrl, getTargetDeduplicationKey } from './urls';
import {
  describeError,
  formatTimestamp,
  logDebug,
  logError,
  logInfo,
  logWarn,
  redactUrl,
} from './logger';

export interface RunSummary {
  run_id: number;
  target_count: number;
  success_count: number;
  error_count: number;
  status: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface MarketGroup {
  sourceKey: string;
  url: string;
  targets: TargetConfig[];
}

export class PriceRunner {
  private dbUrl?: string;

  constructor(dbUrl?: string) {
    this.dbUrl = dbUrl;
  }

  runConfigFile(configPath: string): Promise<RunSummary> {
    const config = loadConfig(configPath);
    return this.run(config, configPath);
  }

  async run(
    config?: AppConfig | null,
    configPath?: string,
    customTargets?: TargetConfig[],
    options?: { force?: boolean }
  ): Promise<RunSummary> {
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
    const runId = startRun(db, configPath || null, config, targetsToRun, undefined, 'cli', {
      config_path: configPath || null,
    });
    return this.executeRun(config, runId, targetsToRun, options);
  }

  async executeRun(
    config: AppConfig | null | undefined,
    runId: number,
    targets?: TargetConfig[],
    options?: { force?: boolean }
  ): Promise<RunSummary> {
    const db = getDatabase(this.dbUrl);
    const runStartedAt = new Date();
    let successCount = 0;
    let errorCount = 0;
    const lastRequestAt: Record<string, number> = {};

    let candidateTargets = targets;
    if (!candidateTargets) {
      const managedTargets = db.prepare(`
        SELECT mt.*, mp.title AS product_title
        FROM managed_targets mt
        LEFT JOIN managed_products mp ON mp.key = mt.product_key
        ORDER BY mt.id ASC
      `).all() as any[];
      if (managedTargets.length > 0) {
        candidateTargets = managedTargets.map((t) => {
          let adapterSettings: Record<string, any> = {};
          try {
            adapterSettings = JSON.parse(t.adapter_settings || '{}');
          } catch {}
          return {
            product_key: t.product_key,
            product_title: t.product_title || undefined,
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
    logInfo('Runner', `run ${runId} started: ${activeTargets.length} active targets`);

    const sources = config?.sources || getSourcesMap(db);
    const fetchedObservations = new Map<string, PriceObservation>();
    const publicKeys = getPublicProductKeys(db);
    const scheduleMap = getProductScheduleMap(db);
    const now = new Date();
    const currentHour = getTimezoneHour(now);

    try {
      const marketTargets: TargetConfig[] = [];
      const regularTargets: TargetConfig[] = [];

      for (const target of activeTargets) {
        const source = sources[target.source_key];
        if (!source) {
          logWarn('Runner', `run ${runId}: source ${target.source_key} not found for target ${target.product_key}`, {
            available_sources: Object.keys(sources),
          });
          continue;
        }
        if (isMarketSource(target.source_key, source.adapter) || target.product_key === USD_PRODUCT_KEY) {
          marketTargets.push(target);
        } else {
          regularTargets.push(target);
        }
      }

      // Market providers return the whole snapshot in one response. Fetch each
      // source+URL once per run and parse every product from that payload.
      for (const group of this.groupMarketTargets(marketTargets)) {
        const source = sources[group.sourceKey];
        if (!source) continue;
        const result = await this.processMarketGroup(db, runId, group, source, {
          force: Boolean(options?.force),
          now,
          currentHour,
          scheduleMap,
          lastRequestAt,
        });
        successCount += result.success;
        errorCount += result.errors;
      }

      for (const target of regularTargets) {
        const source = sources[target.source_key];
        if (!source) continue;
        const isPublic = publicKeys.has(target.product_key);

        if (!options?.force) {
          const sched = scheduleMap.get(target.product_key) ?? { startHour: 0, endHour: 23 };
          if (!isHourInWindow(currentHour, sched.startHour, sched.endHour)) {
            logInfo(
              'Runner',
              `run ${runId}: skipping ${target.product_key}/${target.source_key}, outside active window (${sched.startHour}:00 - ${sched.endHour}:00)`,
              { current_hour: currentHour, window: `${sched.startHour}:00-${sched.endHour}:00` }
            );
            continue;
          }

          if (isPublic) {
            if (hasSuccessfulPriceThisHour(db, target.product_key, now, target.url, target.source_key)) {
              logInfo(
                'Runner',
                `run ${runId}: skipping ${target.product_key}/${target.source_key}, already collected this hour`,
                { current_hour: currentHour }
              );
              continue;
            }
          } else if (hasSuccessfulPriceToday(db, target.product_key, now, target.url, target.source_key)) {
            logInfo(
              'Runner',
              `run ${runId}: skipping ${target.product_key}/${target.source_key}, already collected today`,
              { current_hour: currentHour }
            );
            continue;
          }
        }

        const dedupKey = getTargetDeduplicationKey(target.source_key, target.url, target.adapter_settings);
        if (dedupKey && fetchedObservations.has(dedupKey)) {
          const cachedObservation = fetchedObservations.get(dedupKey)!;
          recordPrice(db, runId, target, cachedObservation);
          successCount++;
          logInfo(
            'Runner',
            `run ${runId}: reused cached observation for ${target.product_key}/${target.source_key} price_irr=${cachedObservation.price_irr}`
          );
          continue;
        }

        // Enforce rate limiting
        await this.respectRateLimit(target.source_key, source.rate_limit_seconds, lastRequestAt);

        logInfo('Runner', `run ${runId}: fetching ${target.product_key}/${target.source_key}`, {
          adapter: source.adapter,
          url: redactUrl(target.url),
          rate_limit_seconds: source.rate_limit_seconds,
        });

        const requestStartedAt = Date.now();
        try {
          const adapter = getAdapter(source.adapter);
          const observation = await adapter.fetch({ source, target });
          const elapsedMs = Date.now() - requestStartedAt;

          if (dedupKey) {
            fetchedObservations.set(dedupKey, observation);
          }

          recordPrice(db, runId, target, observation);
          successCount++;
          logInfo(
            'Runner',
            `run ${runId}: collected ${target.product_key}/${target.source_key} price_irr=${observation.price_irr}`,
            { elapsed_ms: elapsedMs }
          );
        } catch (err: any) {
          errorCount++;
          const details = describeError(err);
          const errorDetails = {
            adapter: source.adapter,
            rate_limit_seconds: source.rate_limit_seconds,
            elapsed_ms: Date.now() - requestStartedAt,
            ...details,
          };
          recordError(db, runId, target, err, {
            ...errorDetails,
            product_key: target.product_key,
            source_key: target.source_key,
          });
          logWarn('Runner', `run ${runId}: failed ${target.product_key}/${target.source_key}`, errorDetails);
        } finally {
          lastRequestAt[target.source_key] = Date.now();
        }
      }

      finishRun(db, runId, successCount, errorCount, activeTargets.length);
    } catch (err) {
      logError('Runner', `run ${runId} aborted unexpectedly`, describeError(err));
      try {
        markRunFailed(db, runId);
      } catch (markErr) {
        logError('Runner', `failed to mark run ${runId} as failed`, describeError(markErr));
      }
      throw err;
    }

    const runRow = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
    const runFinishedAt = new Date();
    logInfo(
      'Runner',
      `run ${runId} finished: status=${runRow.status} success=${successCount} errors=${errorCount}`,
      {
        targets: activeTargets.length,
        started_at: formatTimestamp(runStartedAt),
        duration_ms: runFinishedAt.getTime() - runStartedAt.getTime(),
      }
    );

    return {
      run_id: runId,
      target_count: runRow.target_count,
      success_count: successCount,
      error_count: errorCount,
      status: runRow.status,
    };
  }

  private groupMarketTargets(targets: TargetConfig[]): MarketGroup[] {
    const groups = new Map<string, MarketGroup>();
    for (const target of targets) {
      const key = `${target.source_key}::${normalizeTargetUrl(target.url) || target.url}`;
      let group = groups.get(key);
      if (!group) {
        group = { sourceKey: target.source_key, url: target.url, targets: [] };
        groups.set(key, group);
      }
      group.targets.push(target);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const aUsd = a.targets.some((t) => t.product_key === USD_PRODUCT_KEY) ? 0 : 1;
      const bUsd = b.targets.some((t) => t.product_key === USD_PRODUCT_KEY) ? 0 : 1;
      return aUsd - bUsd;
    });
  }

  private async processMarketGroup(
    db: Database.Database,
    runId: number,
    group: MarketGroup,
    source: SourceConfig,
    options: {
      force: boolean;
      now: Date;
      currentHour: number;
      scheduleMap: Map<string, { startHour: number; endHour: number }>;
      lastRequestAt: Record<string, number>;
    }
  ): Promise<{ success: number; errors: number }> {
    const { force, now, currentHour, scheduleMap, lastRequestAt } = options;

    if (!force) {
      const inWindow = group.targets.some((target) => {
        const sched = scheduleMap.get(target.product_key) ?? { startHour: 0, endHour: 23 };
        return isHourInWindow(currentHour, sched.startHour, sched.endHour);
      });
      if (!inWindow) {
        logInfo('Runner', `run ${runId}: skipping market group ${group.sourceKey}, outside active window`, {
          products: group.targets.length,
          current_hour: currentHour,
        });
        return { success: 0, errors: 0 };
      }

      const interval = getMarketPollIntervalMinutes(db, group.sourceKey);
      // A small tolerance keeps an hourly cron from skipping a run just because
      // the previous snapshot landed a few seconds after the hour mark.
      const effectiveInterval = Math.max(1, interval - 2);
      const recent = group.targets.some((target) =>
        hasSuccessfulPriceWithinMinutes(db, target.product_key, effectiveInterval, now)
      );
      if (recent) {
        logInfo(
          'Runner',
          `run ${runId}: skipping market group ${group.sourceKey}, collected within the last ${interval} minutes`,
          { products: group.targets.length, current_hour: currentHour, poll_interval_minutes: interval }
        );
        return { success: 0, errors: 0 };
      }
    }

    await this.respectRateLimit(group.sourceKey, source.rate_limit_seconds, lastRequestAt);

    logInfo('Runner', `run ${runId}: fetching market group ${group.sourceKey}`, {
      adapter: source.adapter,
      url: redactUrl(group.url),
      products: group.targets.length,
      rate_limit_seconds: source.rate_limit_seconds,
    });

    const requestStartedAt = Date.now();
    try {
      const adapter = getAdapter(source.adapter);
      if (!adapter.fetchShared || !adapter.parseShared) {
        // Fallback for adapters without shared-fetch support.
        let success = 0;
        for (const target of group.targets) {
          const observation = await adapter.fetch({ source, target });
          recordPrice(db, runId, target, observation);
          success++;
        }
        logInfo('Runner', `run ${runId}: collected market group ${group.sourceKey}`, {
          products: success,
          errors: 0,
          elapsed_ms: Date.now() - requestStartedAt,
        });
        return { success, errors: 0 };
      }

      const shared = await adapter.fetchShared({ source, target: group.targets[0] });
      let success = 0;
      let parseErrors = 0;
      for (const target of group.targets) {
        try {
          const observation = adapter.parseShared(shared, { source, target });
          recordPrice(db, runId, target, observation);
          success++;
        } catch (err: any) {
          parseErrors++;
          const details = describeError(err);
          recordError(db, runId, target, err, {
            adapter: source.adapter,
            rate_limit_seconds: source.rate_limit_seconds,
            ...details,
            product_key: target.product_key,
            source_key: target.source_key,
          });
        }
      }
      logInfo('Runner', `run ${runId}: collected market group ${group.sourceKey}`, {
        products: success,
        errors: parseErrors,
        elapsed_ms: Date.now() - requestStartedAt,
      });
      return { success, errors: parseErrors };
    } catch (err: any) {
      const details = describeError(err);
      for (const target of group.targets) {
        recordError(db, runId, target, err, {
          adapter: source.adapter,
          rate_limit_seconds: source.rate_limit_seconds,
          ...details,
          product_key: target.product_key,
          source_key: target.source_key,
        });
      }
      logWarn('Runner', `run ${runId}: failed market group ${group.sourceKey}`, {
        adapter: source.adapter,
        products: group.targets.length,
        rate_limit_seconds: source.rate_limit_seconds,
        elapsed_ms: Date.now() - requestStartedAt,
        ...details,
      });
      return { success: 0, errors: group.targets.length };
    } finally {
      lastRequestAt[group.sourceKey] = Date.now();
    }
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
        // Add subtle random jitter for realistic intervals when rate_limit_seconds >= 1s
        const jitterMs = rateLimitSeconds >= 1 ? Math.floor(Math.random() * 600) + 200 : 0;
        const waitMs = waitTime * 1000 + jitterMs;
        logDebug('Runner', 'waiting for source rate limit', {
          source: sourceKey,
          rate_limit_seconds: rateLimitSeconds,
          wait_ms: Math.round(waitMs),
        });
        await sleep(waitMs);
      }
    }
  }
}
