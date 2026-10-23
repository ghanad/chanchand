"use client";

import React from "react";
import { useDashboard } from "../../context/DashboardContext";
import { statusText, formatDate } from "../../lib/formatters";

export function StatusStrip() {
  const { loading, summary } = useDashboard();
  const latestRun = summary?.latest_run;

  return (
    <footer className="status-strip">
      <span>{loading ? "در حال دریافت داده‌ها" : "آماده"}</span>
      <span>آخرین run: {statusText(latestRun?.status)}</span>
      <span>آخرین مشاهده: {formatDate(summary?.latest_observed_at)}</span>
    </footer>
  );
}
