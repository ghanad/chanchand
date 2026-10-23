"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RunRow, ErrorRow } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { PanelHead } from "../common/PanelHead";
import { RunTable } from "../tables/RunTable";
import { ErrorTable } from "../tables/ErrorTable";

export function RunsView() {
  const { setLoading, showToast, refreshTick } = useDashboard();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, errorsRes] = await Promise.all([
        requestJson<{ rows: RunRow[] }>("/api/runs"),
        requestJson<{ rows: ErrorRow[] }>("/api/errors"),
      ]);
      setRuns(runsRes.rows);
      setErrors(errorsRes.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت اطلاعات اجراها و خطاها");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHead title="Runهای اخیر" meta={`${formatNumber(runs.length)} run`} />
        <RunTable rows={runs} />
      </section>
      <section className="panel">
        <PanelHead title="خطاهای اخیر" meta={`${formatNumber(errors.length)} خطا`} />
        <ErrorTable rows={errors} />
      </section>
    </div>
  );
}
