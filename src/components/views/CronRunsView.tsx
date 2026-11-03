"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CronStats, CronRunDetail, RunRow } from "@/types/dashboard";
import { requestJson } from "@/lib/api-client";
import { formatNumber, formatDate, statusText, formatDuration, triggerSourceText } from "@/lib/formatters";
import { useDashboard } from "@/context/DashboardContext";
import { PanelHead } from "@/components/common/PanelHead";
import { StatusPill } from "@/components/common/StatusPill";
import { Modal } from "@/components/common/Modal";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";

export function CronRunsView() {
  const { setLoading, showToast, refreshTick, triggerRefresh } = useDashboard();
  const [stats, setStats] = useState<CronStats | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<CronRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<"errors" | "snapshots">("errors");

  const [isTesting, setIsTesting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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

  // Copy command helper
  const handleCopy = (text: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  // Parse trigger details json safely
  const parsedDetails = useMemo(() => {
    if (!runDetail?.run?.trigger_details) return null;
    try {
      return JSON.parse(runDetail.run.trigger_details);
    } catch {
      return { raw: runDetail.run.trigger_details };
    }
  }, [runDetail]);

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

  const cronSampleCommand = `0 * * * * curl -s -X POST http://localhost:8000/api/trigger-run -H "Authorization: Bearer <TRIGGER_API_KEY>" >> /var/log/price-getter-cron.log 2>&1`;
  const curlSampleCommand = `curl -s -X POST http://localhost:8000/api/trigger-run \\
  -H "Authorization: Bearer <TRIGGER_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"source": "cron"}'`;

  // Render visual trigger source badge
  const renderSourceBadge = (source: string | null | undefined) => {
    const isCron = source === "cron";
    const isApi = source === "api";

    if (isCron) {
      return (
        <span
          className="status-pill"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(124, 58, 237, 0.09)",
            color: "#7c3aed",
            border: "1px solid rgba(124, 58, 237, 0.2)",
            fontWeight: 600,
            fontSize: "11.5px",
            padding: "2px 8px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>کرون (Cron)</span>
        </span>
      );
    }

    if (isApi) {
      return (
        <span
          className="status-pill"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(2, 132, 199, 0.09)",
            color: "#0284c7",
            border: "1px solid rgba(2, 132, 199, 0.2)",
            fontWeight: 600,
            fontSize: "11.5px",
            padding: "2px 8px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span>فراخوانی API</span>
        </span>
      );
    }

    return (
      <span
        className="status-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          background: "var(--surface-soft)",
          color: "var(--muted)",
          border: "1px solid var(--line)",
          fontWeight: 500,
          fontSize: "11.5px",
          padding: "2px 8px",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>{triggerSourceText(source)}</span>
      </span>
    );
  };

  return (
    <div className="page-stack">
      {/* راهنمای تنظیم Crontab و نمونه دستورات با قابلیت کپی */}
      <section className="panel">
        <details className="source-guide-accordion">
          <summary>
            <span>راهنمای زمان‌بندی خودکار در سیستم‌عامل (Linux Crontab / cURL Webhook)</span>
            {copyFeedback && (
              <span className="status-pill tone-success" style={{ marginRight: "auto" }}>
                {copyFeedback} کپی شد!
              </span>
            )}
          </summary>
          <div className="source-guide-content" style={{ marginTop: "12px" }}>
            <p style={{ margin: "0 0 10px 0", fontSize: "13px", lineHeight: 1.7 }}>
              برای اجرای خودکار فرآیند جمع‌آوری قیمت‌ها، کافیست اندپوینت همگام <code>/api/trigger-run</code> را از طریق{" "}
              <code>crontab</code> سرور لینوکس یا سرویس‌های زمان‌بندی آنلاین (مانند cron-job.org) به صورت دوره‌ای صدا بزنید.
            </p>
            <div style={{ display: "grid", gap: "10px", margin: "10px 0" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "12px" }}>دستور پیشنهادی برای Crontab (اجرای ساعتی — جمع‌آوری محصولات عمومی بین ۸ تا ۲۳ و محصولات اختصاصی روزانه):</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                    onClick={() => handleCopy(cronSampleCommand, "دستور Crontab")}
                  >
                    کپی دستور Crontab
                  </button>
                </div>
                <code style={{ display: "block", padding: "8px 12px", whiteSpace: "pre-wrap", direction: "ltr" }}>
                  {cronSampleCommand}
                </code>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong style={{ fontSize: "12px" }}>نمونه تست مستقیم با cURL:</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                    onClick={() => handleCopy(curlSampleCommand, "دستور cURL")}
                  >
                    کپی دستور cURL
                  </button>
                </div>
                <code style={{ display: "block", padding: "8px 12px", whiteSpace: "pre-wrap", direction: "ltr" }}>
                  {curlSampleCommand}
                </code>
              </div>
            </div>
            <p className="guide-note-muted">
              نکته: در صورت تمایل می‌توانید پارامتر <code>product_key</code> را جهت قیمت‌گیری فقط برای یک کالای مشخص به صورت کوئری استرینگ یا بادی JSON ارسال کنید.
            </p>
          </div>
        </details>
      </section>

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

        {/* نوار ابزار فیلتر و جستجو با استایل استاندارد تب‌های پیل */}
        <div className="product-table-toolbar" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", marginBottom: 0 }}>
          {/* سمت راست در RTL: تب‌های منبع فراخوانی */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div className="status-filter-pills" role="tablist" aria-label="فیلتر منبع اجرا">
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === "all"}
                className={`filter-pill-btn ${sourceFilter === "all" ? "is-active" : ""}`}
                onClick={() => {
                  setSourceFilter("all");
                  setCurrentPage(1);
                }}
              >
                همه منبع‌ها
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === "cron"}
                className={`filter-pill-btn ${sourceFilter === "cron" ? "is-active" : ""}`}
                onClick={() => {
                  setSourceFilter("cron");
                  setCurrentPage(1);
                }}
              >
                کرون سرور (Cron)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === "api"}
                className={`filter-pill-btn ${sourceFilter === "api" ? "is-active" : ""}`}
                onClick={() => {
                  setSourceFilter("api");
                  setCurrentPage(1);
                }}
              >
                وب‌هوک و API
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === "manual"}
                className={`filter-pill-btn ${sourceFilter === "manual" ? "is-active" : ""}`}
                onClick={() => {
                  setSourceFilter("manual");
                  setCurrentPage(1);
                }}
              >
                دستی و پنل
              </button>
            </div>

            {/* فیلتر وضعیت اجرا */}
            <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر وضعیت اجرا">
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "all"}
                className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
              >
                همه وضعیت‌ها
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "success"}
                className={`filter-pill-btn ${statusFilter === "success" ? "is-active" : ""}`}
                onClick={() => {
                  setStatusFilter("success");
                  setCurrentPage(1);
                }}
              >
                فقط موفق
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={statusFilter === "failed"}
                className={`filter-pill-btn ${statusFilter === "failed" ? "is-active" : ""}`}
                onClick={() => {
                  setStatusFilter("failed");
                  setCurrentPage(1);
                }}
              >
                دارای خطا
              </button>
            </div>
          </div>

          {/* سمت چپ در RTL: جستجوی سریع در شناسه و جزئیات */}
          <div className="product-search-wrapper" style={{ minWidth: "220px", maxWidth: "280px" }}>
            <span className="product-search-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="product-search-input"
              placeholder="جستجو در شناسه اجرا..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="جستجوی اجراها"
            />
            {searchQuery && (
              <button
                type="button"
                className="product-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                aria-label="پاک کردن"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* جدول سوابق استاندارد با کلاس‌های مدرن */}
        <div className="product-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          {filteredRuns.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <EmptyState text="هیچ اجرایی با فیلترهای انتخابی یافت نشد." />
              <button
                type="button"
                className="primary-button run-collection-btn"
                onClick={handleRunTest}
                disabled={isTesting}
                style={{ marginTop: "14px" }}
              >
                اجرای تست فراخوانی
              </button>
            </div>
          ) : (
            <table className="product-compact-table" aria-label="جدول اجراهای کرون و API">
              <thead>
                <tr>
                  <th style={{ width: "80px", textAlign: "center" }}>شناسه</th>
                  <th style={{ width: "160px" }}>منبع فراخوانی</th>
                  <th style={{ width: "120px" }}>وضعیت اجرا</th>
                  <th style={{ width: "180px" }}>اهداف و خروجی</th>
                  <th>زمان شروع</th>
                  <th style={{ width: "130px" }}>مدت زمان</th>
                  <th style={{ width: "130px", textAlign: "center" }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRuns.map((row) => (
                  <tr key={row.id} className="product-table-row">
                    {/* ۱. شناسه اجرا */}
                    <td style={{ textAlign: "center" }}>
                      <strong style={{ fontSize: "13px", color: "var(--text)" }}>#{formatNumber(row.id)}</strong>
                    </td>

                    {/* ۲. منبع فراخوانی با بج تصویری */}
                    <td>{renderSourceBadge(row.trigger_source)}</td>

                    {/* ۳. وضعیت */}
                    <td>
                      <StatusPill text={statusText(row.status)} tone={row.status} />
                    </td>

                    {/* ۴. خلاصه اهداف و نتایج */}
                    <td>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
                        <span style={{ color: "var(--muted)" }}>
                          <strong>{formatNumber(row.target_count)}</strong> هدف
                        </span>
                        <span
                          style={{
                            color: "var(--ok)",
                            fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.1)",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            fontSize: "11.5px",
                          }}
                          title={`${formatNumber(row.success_count)} هدف با موفقیت استعلام شد`}
                        >
                          ✓ {formatNumber(row.success_count)}
                        </span>
                        {row.error_count > 0 && (
                          <span
                            style={{
                              color: "var(--danger)",
                              fontWeight: 700,
                              background: "rgba(239, 68, 68, 0.1)",
                              padding: "2px 7px",
                              borderRadius: "4px",
                              fontSize: "11.5px",
                            }}
                            title={`${formatNumber(row.error_count)} هدف با خطا مواجه شد`}
                          >
                            ✕ {formatNumber(row.error_count)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ۵. زمان شروع */}
                    <td style={{ fontSize: "12.5px", color: "var(--muted)" }}>{formatDate(row.started_at)}</td>

                    {/* ۶. مدت زمان */}
                    <td>
                      <span
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          direction: "ltr",
                          display: "inline-block",
                          background: "var(--surface-soft)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {formatDuration(row.duration_ms)}
                      </span>
                    </td>

                    {/* ۷. عملیات */}
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{
                          fontSize: "12px",
                          padding: "4px 12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          borderRadius: "6px",
                        }}
                        onClick={() => handleOpenDetail(row.id)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>مشاهده خروجی</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* صفحه‌بندی */}
        {filteredRuns.length > pageSize && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredRuns.length}
              pageSizeOptions={[10, 15, 30, 50]}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </section>

      {/* مودال جزئیات و نتایج دقیق یک اجرا */}
      <Modal
        isOpen={selectedRunId !== null}
        onClose={() => {
          setSelectedRunId(null);
          setRunDetail(null);
        }}
        title={`جزئیات و خروجی اجرای شماره ${selectedRunId ? formatNumber(selectedRunId) : ""}`}
        maxWidth="760px"
      >
        {loadingDetail && (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
            <span className="spinner-sm" style={{ marginLeft: "8px" }} />
            در حال بارگذاری نتایج و خطاهای اجرا...
          </div>
        )}

        {!loadingDetail && runDetail && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* اطلاعات پایه و مشخصات اجرا */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
                background: "var(--surface-soft)",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--line)",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>منبع اجرا:</span>
                <strong style={{ fontSize: "12.5px" }}>{renderSourceBadge(runDetail.run.trigger_source)}</strong>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>وضعیت:</span>
                <StatusPill text={statusText(runDetail.run.status)} tone={runDetail.run.status} />
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>زمان شروع:</span>
                <span style={{ fontSize: "12px" }}>{formatDate(runDetail.run.started_at)}</span>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>مدت زمان:</span>
                <span style={{ fontSize: "12px" }}>{formatDuration(runDetail.run.duration_ms)}</span>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block" }}>نتیجه نهایی:</span>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>
                  <span style={{ color: "var(--ok)" }}>{formatNumber(runDetail.run.success_count)} موفق</span> /{" "}
                  <span style={{ color: runDetail.run.error_count > 0 ? "var(--danger)" : "var(--muted)" }}>
                    {formatNumber(runDetail.run.error_count)} خطا
                  </span>
                </span>
              </div>
            </div>

            {/* جزئیات فراخوانی در صورت وجود */}
            {parsedDetails && (
              <div
                style={{
                  fontSize: "12px",
                  background: "var(--surface)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  color: "var(--muted)",
                  lineHeight: 1.6,
                }}
              >
                {parsedDetails.user_agent && (
                  <div>
                    <strong>User-Agent:</strong> <span style={{ direction: "ltr", display: "inline-block" }}>{parsedDetails.user_agent}</span>
                  </div>
                )}
                {parsedDetails.ip && (
                  <div>
                    <strong>IP فراخوان:</strong> <span style={{ direction: "ltr", display: "inline-block" }}>{parsedDetails.ip}</span>
                  </div>
                )}
                {parsedDetails.product_key && (
                  <div>
                    <strong>محصول مشخص‌شده:</strong> {parsedDetails.product_key}
                  </div>
                )}
                {parsedDetails.initiated_by && (
                  <div>
                    <strong>کاربر شروع‌کننده:</strong> {parsedDetails.initiated_by}
                  </div>
                )}
              </div>
            )}

            {/* تب‌های نتایج (خطاها / قیمت‌ها) */}
            <div className="status-filter-pills" role="tablist" style={{ width: "fit-content" }}>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === "errors"}
                className={`filter-pill-btn ${detailTab === "errors" ? "is-active" : ""}`}
                onClick={() => setDetailTab("errors")}
              >
                خطاهای ثبت‌شده ({formatNumber(runDetail.errors.length)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === "snapshots"}
                className={`filter-pill-btn ${detailTab === "snapshots" ? "is-active" : ""}`}
                onClick={() => setDetailTab("snapshots")}
              >
                قیمت‌های دریافت‌شده ({formatNumber(runDetail.snapshots.length)})
              </button>
            </div>

            {/* محتوای تب خطاها */}
            {detailTab === "errors" && (
              <div>
                {runDetail.errors.length === 0 ? (
                  <EmptyState text="هیچ خطایی در این اجرا ثبت نشده است و تمامی اهداف با موفقیت انجام شده‌اند." />
                ) : (
                  <div className="product-table-wrap" style={{ maxHeight: "320px", overflowY: "auto" }}>
                    <table className="product-compact-table" aria-label="خطاهای ثبت شده در اجرا">
                      <thead>
                        <tr>
                          <th>منبع</th>
                          <th>محصول</th>
                          <th>نوع خطا</th>
                          <th>پیام و علت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runDetail.errors.map((err) => (
                          <tr key={err.id} className="product-table-row">
                            <td>
                              <code>{err.source_key}</code>
                            </td>
                            <td>
                              <strong>{err.product_key}</strong>
                            </td>
                            <td>
                              <span className="status-pill tone-failed">{err.error_type}</span>
                            </td>
                            <td style={{ fontSize: "12px", color: "var(--danger)", maxWidth: "260px", wordBreak: "break-word" }}>
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* محتوای تب قیمت‌های دریافتی */}
            {detailTab === "snapshots" && (
              <div>
                {runDetail.snapshots.length === 0 ? (
                  <EmptyState text="هیچ قیمتی در این نوبت ثبت نشده است." />
                ) : (
                  <div className="product-table-wrap" style={{ maxHeight: "320px", overflowY: "auto" }}>
                    <table className="product-compact-table" aria-label="قیمت‌های دریافت شده در اجرا">
                      <thead>
                        <tr>
                          <th>محصول</th>
                          <th>منبع</th>
                          <th>قیمت (تومان)</th>
                          <th>وضعیت موجودی</th>
                          <th>زمان مشاهده</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runDetail.snapshots.map((snap) => (
                          <tr key={snap.id} className="product-table-row">
                            <td>
                              <strong>{snap.title || snap.product_key}</strong>
                            </td>
                            <td>
                              <code>{snap.source_key}</code>
                            </td>
                            <td>
                              {snap.price_toman ? (
                                <strong style={{ color: "var(--accent)" }}>{formatNumber(snap.price_toman)} تومان</strong>
                              ) : (
                                <span className="muted-cell">-</span>
                              )}
                            </td>
                            <td>
                              <StatusPill
                                text={snap.availability === "in_stock" ? "موجود" : snap.availability}
                                tone={snap.availability}
                              />
                            </td>
                            <td style={{ fontSize: "11.5px", color: "var(--muted)" }}>{formatDate(snap.observed_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSelectedRunId(null);
                  setRunDetail(null);
                }}
              >
                بستن
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
