"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CronStats, CronRunDetail, RunRow } from "@/types/dashboard";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDuration } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { PanelHead } from "@/components/common/PanelHead";
import {
  CronSourceFilter,
  CronStatusFilter,
  CronInstructions,
  CronRunsToolbar,
  CronRunsTable,
  CronRunDetailModal,
} from "./cron-runs";

export function CronRunsView() {
  const { setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [stats, setStats] = useState<CronStats | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [sourceFilter, setSourceFilter] = useState<CronSourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<CronStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<CronRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"errors" | "snapshots">("errors");

  const [isTesting, setIsTesting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");

      const res = await requestJson<{ stats: CronStats; rows: RunRow[] }>(
        `/api/admin/cron-runs?${params.toString()}`
      );
      setStats(res.stats);
      setRuns(res.rows);
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در دریافت وضعیت اجراهای کرون و API");
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, statusFilter, setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Load specific run details when a run is selected
  const handleOpenDetail = async (runId: number) => {
    setSelectedRunId(runId);
    setLoadingDetail(true);
    setRunDetail(null);
    try {
      const detail = await requestJson<CronRunDetail>(`/api/admin/cron-runs/${runId}`);
      setRunDetail(detail);
      if (detail.errors.length > 0) {
        setDetailTab("errors");
      } else {
        setDetailTab("snapshots");
      }
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در دریافت جزئیات اجرا");
    } finally {
      setLoadingDetail(false);
    }
  };

  // Trigger test execution
  const handleRunTest = async () => {
    if (isTesting || stats?.is_active_running) return;
    setIsTesting(true);
    try {
      const result = await requestJson<{
        ok: boolean;
        run_id: number;
        status: string;
        success_count: number;
        error_count: number;
        duration_ms: number;
      }>("/api/admin/cron-runs/test", {
        method: "POST",
      });

      if (result.ok) {
        showToast(
          `اجرای تست #${result.run_id} با موفقیت به پایان رسید (${formatNumber(
            result.success_count
          )} موفق، ${formatNumber(result.error_count)} خطا در ${formatDuration(result.duration_ms)})`
        );
      }
      await loadData();
      triggerRefresh();
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : "خطا در اجرای تست کرون/API");
    } finally {
      setIsTesting(false);
    }
  };

  // Filtered runs by search query (ID or trigger details)
  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;
    const query = searchQuery.trim().toLowerCase().replace("#", "");
    return runs.filter((r) => {
      if (String(r.id).includes(query)) return true;
      if (r.status.toLowerCase().includes(query)) return true;
      if (r.trigger_source?.toLowerCase().includes(query)) return true;
      if (r.trigger_details?.toLowerCase().includes(query)) return true;
      return false;
    });
  }, [runs, searchQuery]);

  // Paginated rows
  const paginatedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize);
  }, [filteredRuns, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRuns.length / pageSize) || 1;

  return (
    <div className="page-stack">
      {/* راهنمای تنظیم Crontab و نمونه دستورات با قابلیت کپی */}
      <CronInstructions />

      {/* پنل جدول تاریخچه اجراهای Cron و API */}
      <section className="panel product-list-panel">
        <PanelHead
          title="تاریخچه و نتایج اجراهای Cron و API"
          meta={`${formatNumber(filteredRuns.length)} اجرا`}
          action={
            <button
              type="button"
              className="primary-button run-collection-btn"
              onClick={handleRunTest}
              disabled={isTesting || stats?.is_active_running}
              aria-label="تست اجرای جمع‌آوری قیمت"
            >
              {isTesting || stats?.is_active_running ? (
                <>
                  <span className="spinner-sm" aria-hidden="true" />
                  <span>در حال اجرا...</span>
                </>
              ) : (
                <>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>تست فراخوانی</span>
                </>
              )}
            </button>
          }
        />

        {/* نوار ابزار فیلتر و جستجو */}
        <CronRunsToolbar
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onFilterChange={() => setCurrentPage(1)}
        />

        {/* جدول سوابق و صفحه‌بندی */}
        <CronRunsTable
          filteredRuns={filteredRuns}
          paginatedRuns={paginatedRuns}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          isTesting={isTesting}
          onRunTest={handleRunTest}
          onOpenDetail={handleOpenDetail}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      </section>

      {/* مودال جزئیات و نتایج دقیق یک اجرا */}
      <CronRunDetailModal
        selectedRunId={selectedRunId}
        runDetail={runDetail}
        loadingDetail={loadingDetail}
        detailTab={detailTab}
        setDetailTab={setDetailTab}
        onClose={() => {
          setSelectedRunId(null);
          setRunDetail(null);
        }}
      />
    </div>
  );
}
