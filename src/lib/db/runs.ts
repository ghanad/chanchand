import Database from 'better-sqlite3';
import {
  AppConfig,
  FetchErrorRow,
  ProductConfig,
  RunRow,
  TargetConfig,
} from '../types';
import { getSourcesMap } from './sources';
import { getManagedProducts, getManagedTargets } from './products';

export * from './snapshots';
export * from './errors';

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
