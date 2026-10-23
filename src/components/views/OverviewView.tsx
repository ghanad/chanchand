"use client";

import React, { useEffect, useState, useCallback } from "react";
import { LatestPayload, RunRow, ErrorRow } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber, formatDate, statusText } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { Metric } from "../common/Metric";
import { PanelHead } from "../common/PanelHead";
import { PriceTable } from "../tables/PriceTable";
import { RunTable } from "../tables/RunTable";
import { ErrorTable } from "../tables/ErrorTable";

export function OverviewView() {
  const { setSummary, setLoading, showToast, refreshTick } = useDashboard();
  const [latest, setLatest] = useState<LatestPayload | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [latestRes, runsRes, errorsRes] = await Promise.all([
        requestJson<LatestPayload>("/api/latest"),
        requestJson<{ rows: RunRow[] }>("/api/runs"),
        requestJson<{ rows: ErrorRow[] }>("/api/errors"),
      ]);
      setLatest(latestRes);
      setSummary(latestRes.summary);
      setRuns(runsRes.rows);
      setErrors(errorsRes.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت اطلاعات نمای کلی");
    } finally {
      setLoading(false);
    }
  }, [setLoading, setSummary, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const latestRun = latest?.summary.latest_run || null;
  const rows = latest?.rows || [];

  return (
    <div className="page-stack">
      <section className="metric-grid" aria-label="خلاصه">
        <Metric label="محصول‌ها" value={formatNumber(latest?.summary.product_count)} />
        <Metric label="آخرین run" value={statusText(latestRun?.status)} tone={latestRun?.status} />
        <Metric
          label="موفق / خطا"
          value={latestRun ? `${formatNumber(latestRun.success_count)} / ${formatNumber(latestRun.error_count)}` : "-"}
        />
        <Metric label="آخرین مشاهده" value={formatDate(latest?.summary.latest_observed_at)} />
      </section>

      <section className="overview-grid">
        <div className="panel">
          <PanelHead title="آخرین قیمت‌ها" meta={`${formatNumber(rows.length)} ردیف`} />
          <PriceTable rows={rows.slice(0, 8)} compact />
        </div>
        <div className="panel">
          <PanelHead title="وضعیت عملیات" meta={`${formatNumber(runs.length)} run`} />
          <RunTable rows={runs.slice(0, 6)} compact />
        </div>
      </section>

      <section className="panel">
        <PanelHead title="خطاهای اخیر" meta={`${formatNumber(errors.length)} خطا`} />
        <ErrorTable rows={errors.slice(0, 6)} />
      </section>
    </div>
  );
}
