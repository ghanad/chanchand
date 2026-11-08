import Database from 'better-sqlite3';
import {
  AppConfig,
  FetchErrorRow,
  PriceObservation,
  PriceSnapshotRow,
  ProductConfig,
  RunRow,
  TargetConfig,
} from '../types';
import { getSourcesMap } from './sources';
import { getManagedProducts, getManagedTargets } from './products';

export function startRun(
  db: Database.Database,
  configPath: string | null,
  config?: AppConfig | null,
  targets?: TargetConfig[],
  products?: Record<string, ProductConfig>,
  triggerSource: string = 'manual',
  triggerDetails?: Record<string, any> | string | null
): number {
  let effectiveSources = config?.sources;
  if (!effectiveSources || Object.keys(effectiveSources).length === 0) {
    effectiveSources = getSourcesMap(db);
  }

  let effectiveTargets = targets;
  if (!effectiveTargets) {
    const managedTargets = getManagedTargets(db);
    if (managedTargets.length > 0) {
      effectiveTargets = managedTargets.map((t) => {
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
      effectiveTargets = config?.targets || [];
    }
  }

  let effectiveProducts = products;
  if (!effectiveProducts) {
    const managedProds = getManagedProducts(db);
    if (managedProds.length > 0) {
      effectiveProducts = {};
      for (const p of managedProds) {
        effectiveProducts[p.key] = { title: p.title };
      }
    } else {
      effectiveProducts = config?.products || {};
    }
  }

  const activeTargetsCount = effectiveTargets.filter((t) => t.enabled).length;
  const startedAt = new Date().toISOString();

  let detailsStr: string | null = null;
  if (triggerDetails) {
    detailsStr = typeof triggerDetails === 'string' ? triggerDetails : JSON.stringify(triggerDetails);
  }

  const insertRun = db.prepare(`
    INSERT INTO runs (started_at, status, config_path, target_count, success_count, error_count, trigger_source, trigger_details)
    VALUES (?, 'running', ?, ?, 0, 0, ?, ?)
  `);
  const result = insertRun.run(startedAt, configPath, activeTargetsCount, triggerSource || 'manual', detailsStr);
  const runId = Number(result.lastInsertRowid);

  const insertSource = db.prepare(`
    INSERT INTO sources (run_id, key, adapter, config_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, source] of Object.entries(effectiveSources)) {
    insertSource.run(runId, key, source.adapter, JSON.stringify(source));
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (run_id, key, title, config_json)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, product] of Object.entries(effectiveProducts)) {
    insertProduct.run(runId, key, product.title, JSON.stringify(product));
  }

  const insertTarget = db.prepare(`
    INSERT INTO product_targets (run_id, product_key, source_key, url, enabled, config_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const target of effectiveTargets) {
    insertTarget.run(
      runId,
      target.product_key,
      target.source_key,
      target.url,
      target.enabled ? 1 : 0,
      JSON.stringify(target)
    );
  }

  return runId;
}

export function finishRun(
  db: Database.Database,
  runId: number,
  successCount: number,
  errorCount: number,
  targetCount: number
): void {
  const finishedAt = new Date().toISOString();
  let status = 'success';
  if (errorCount === 0) {
    status = 'success';
  } else if (successCount === 0 && targetCount > 0) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  db.prepare(`
    UPDATE runs
    SET finished_at = ?, status = ?, success_count = ?, error_count = ?
    WHERE id = ?
  `).run(finishedAt, status, successCount, errorCount, runId);
}

export function markRunFailed(db: Database.Database, runId: number): void {
  const finishedAt = new Date().toISOString();
  db.prepare(`
    UPDATE runs
    SET finished_at = ?, status = 'failed'
    WHERE id = ?
  `).run(finishedAt, runId);
}

export function recordPrice(
  db: Database.Database,
  runId: number,
  target: TargetConfig,
  observation: PriceObservation
): number {
  const observedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_snapshots (
      run_id, product_key, source_key, url, title, seller, price_irr, availability, observed_at, raw_observation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    runId,
    target.product_key,
    target.source_key,
    target.url,
    observation.title ?? null,
    observation.seller ?? null,
    observation.price_irr ?? null,
    observation.availability,
    observedAt,
    JSON.stringify(observation.raw_observation ?? {})
  );
  return Number(res.lastInsertRowid);
}

export function recordError(
  db: Database.Database,
  runId: number,
  target: TargetConfig,
  error: Error | any,
  rawObservation?: Record<string, any>
): number {
  const observedAt = new Date().toISOString();
  const errorType = error?.name || 'Error';
  const message = error?.message || String(error);
  const stmt = db.prepare(`
    INSERT INTO fetch_errors (
      run_id, product_key, source_key, url, error_type, message, observed_at, raw_observation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    runId,
    target.product_key,
    target.source_key,
    target.url,
    errorType,
    message,
    observedAt,
    JSON.stringify(rawObservation ?? {})
  );
  return Number(res.lastInsertRowid);
}

export function latestSnapshots(
  db: Database.Database,
  limit = 100,
  allowedProductKeys?: string[] | Set<string>
): PriceSnapshotRow[] {
  const allowedSet = allowedProductKeys
    ? (allowedProductKeys instanceof Set ? allowedProductKeys : new Set(allowedProductKeys))
    : null;

  // Return latest snapshot for each (product_key, source_key) with previous different price
  const rows = db.prepare(`
    SELECT * FROM price_snapshots
    ORDER BY observed_at DESC, id DESC
  `).all() as PriceSnapshotRow[];

  const seen = new Set<string>();
  const hasDiff = new Set<string>();
  const samePriceFallback = new Map<string, PriceSnapshotRow>();
  const latestMap = new Map<string, PriceSnapshotRow>();
  const latestOrder: string[] = [];

  for (const row of rows) {
    if (allowedSet && !allowedSet.has(row.product_key)) {
      continue;
    }
    const key = `${row.product_key}:${row.source_key}`;
    if (!seen.has(key)) {
      if (latestOrder.length < limit) {
        seen.add(key);
        latestMap.set(key, { ...row });
        latestOrder.push(key);
      }
    } else if (!hasDiff.has(key) && row.price_irr !== null && row.price_irr !== undefined) {
      const latestItem = latestMap.get(key);
      if (latestItem && latestItem.price_irr !== null && latestItem.price_irr !== undefined) {
        if (row.price_irr !== latestItem.price_irr) {
          hasDiff.add(key);
          latestItem.previous_price_irr = row.price_irr;
          latestItem.previous_observed_at = row.observed_at;
        } else if (!samePriceFallback.has(key)) {
          samePriceFallback.set(key, row);
        }
      }
    }
  }

  // If price never changed historically across runs, fall back to identical price
  for (const [key, fallback] of samePriceFallback.entries()) {
    if (!hasDiff.has(key)) {
      const latestItem = latestMap.get(key);
      if (latestItem) {
        latestItem.previous_price_irr = fallback.price_irr;
        latestItem.previous_observed_at = fallback.observed_at;
      }
    }
  }

  return latestOrder.slice(0, limit).map((key) => latestMap.get(key)!);
}

export function productHistory(
  db: Database.Database,
  productKey: string,
  sourceKey?: string | null,
  limit = 50
): PriceSnapshotRow[] {
  if (sourceKey) {
    return db.prepare(`
      SELECT * FROM price_snapshots
      WHERE product_key = ? AND source_key = ?
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(productKey, sourceKey, limit) as PriceSnapshotRow[];
  }
  return db.prepare(`
    SELECT * FROM price_snapshots
    WHERE product_key = ?
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(productKey, limit) as PriceSnapshotRow[];
}

export function productHistoryChronological(
  db: Database.Database,
  productKey: string,
  sourceKey?: string | null,
  limit = 200
): PriceSnapshotRow[] {
  const rows = productHistory(db, productKey, sourceKey, limit);
  return rows.reverse();
}

export function recentErrors(
  db: Database.Database,
  limit = 50,
  allowedProductKeys?: string[] | Set<string>
): FetchErrorRow[] {
  if (allowedProductKeys) {
    const allowedArr = Array.from(allowedProductKeys);
    if (allowedArr.length === 0) return [];
    const placeholders = allowedArr.map(() => '?').join(',');
    return db.prepare(`
      SELECT * FROM fetch_errors
      WHERE product_key IN (${placeholders})
      ORDER BY observed_at DESC, id DESC
      LIMIT ?
    `).all(...allowedArr, limit) as FetchErrorRow[];
  }

  return db.prepare(`
    SELECT * FROM fetch_errors
    ORDER BY observed_at DESC, id DESC
    LIMIT ?
  `).all(limit) as FetchErrorRow[];
}

export function recentRuns(db: Database.Database, limit = 20): RunRow[] {
  return db.prepare(`
    SELECT * FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `).all(limit) as RunRow[];
}

export function getCronRuns(
  db: Database.Database,
  limit = 50,
  filterSource?: string,
  filterStatus?: string
): RunRow[] {
  let query = 'SELECT * FROM runs WHERE 1=1';
  const params: any[] = [];

  if (filterSource && filterSource !== 'all') {
    if (filterSource === 'automated') {
      query += " AND (trigger_source IN ('cron', 'api') OR trigger_source IS NULL)";
    } else {
      query += ' AND trigger_source = ?';
      params.push(filterSource);
    }
  }

  if (filterStatus && filterStatus !== 'all') {
    query += ' AND status = ?';
    params.push(filterStatus);
  }

  query += ' ORDER BY started_at DESC, id DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params) as RunRow[];
}

export function latestRun(db: Database.Database): RunRow | null {
  return (db.prepare(`
    SELECT * FROM runs
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get() as RunRow) || null;
}

export function getCronRunStats(db: Database.Database): {
  last_run: RunRow | null;
  total_runs_24h: number;
  success_runs_24h: number;
  error_runs_24h: number;
  success_rate_24h: number;
  is_active_running: boolean;
  active_run_id: number | null;
  cron_configured: boolean;
} {
  const lastRunCron = (db.prepare(`
    SELECT * FROM runs
    WHERE trigger_source IN ('cron', 'api')
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get() as RunRow | undefined) || null;

  const lastRunAny = lastRunCron || latestRun(db);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const stats24h = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_runs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_runs,
      SUM(target_count) as total_targets,
      SUM(success_count) as total_success_targets
    FROM runs
    WHERE started_at >= ?
  `).get(twentyFourHoursAgo) as {
    total_runs: number;
    success_runs: number;
    error_runs: number;
    total_targets: number;
    total_success_targets: number;
  } | undefined;

  const totalRuns24h = stats24h?.total_runs || 0;
  const successRuns24h = stats24h?.success_runs || 0;
  const errorRuns24h = stats24h?.error_runs || 0;
  const totalTargets = stats24h?.total_targets || 0;
  const totalSuccessTargets = stats24h?.total_success_targets || 0;

  const successRate = totalTargets > 0
    ? Math.round((totalSuccessTargets / totalTargets) * 100)
    : totalRuns24h > 0
    ? Math.round((successRuns24h / totalRuns24h) * 100)
    : 100;

  const cronConfigured = Boolean(
    (process.env.TRIGGER_API_KEY && process.env.TRIGGER_API_KEY.trim().length > 0) ||
    (process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length > 0)
  );

  return {
    last_run: lastRunAny,
    total_runs_24h: totalRuns24h,
    success_runs_24h: successRuns24h,
    error_runs_24h: errorRuns24h,
    success_rate_24h: successRate,
    is_active_running: false,
    active_run_id: null,
    cron_configured: cronConfigured,
  };
}

export function getRunDetails(db: Database.Database, runId: number) {
  const run = (db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as RunRow | undefined) || null;
  if (!run) return null;

  const snapshots = db.prepare(`
    SELECT id, product_key, source_key, url, title, seller, price_irr, availability, observed_at
    FROM price_snapshots
    WHERE run_id = ?
    ORDER BY id DESC
  `).all(runId);

  const errors = db.prepare(`
    SELECT id, run_id, product_key, source_key, url, error_type, message, observed_at
    FROM fetch_errors
    WHERE run_id = ?
    ORDER BY id DESC
  `).all(runId) as FetchErrorRow[];

  return {
    run,
    snapshots,
    errors,
  };
}

export function productsFromLatestRun(db: Database.Database): Array<{ id: number; run_id: number; key: string; title: string; config_json: string }> {
  const run = latestRun(db);
  if (!run) return [];
  return db.prepare(`
    SELECT * FROM products
    WHERE run_id = ?
    ORDER BY key
  `).all(run.id) as any;
}

export function sourcesFromLatestRun(db: Database.Database): Array<{ id: number; run_id: number; key: string; adapter: string; config_json: string }> {
  const run = latestRun(db);
  if (!run) return [];
  return db.prepare(`
    SELECT * FROM sources
    WHERE run_id = ?
    ORDER BY key
  `).all(run.id) as any;
}
