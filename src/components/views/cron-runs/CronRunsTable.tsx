import React from "react";
import { RunRow } from "@/types/dashboard";
import { formatNumber, statusText, formatDuration } from "@/lib/formatters";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { DateTime } from "@/components/common/DateTime";
import { SourceBadge } from "./SourceBadge";

interface CronRunsTableProps {
  filteredRuns: RunRow[];
  paginatedRuns: RunRow[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  isTesting: boolean;
  onRunTest: () => void;
  onOpenDetail: (runId: number) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function CronRunsTable({
  filteredRuns,
  paginatedRuns,
  currentPage,
  totalPages,
  pageSize,
  isTesting,
  onRunTest,
  onOpenDetail,
  onPageChange,
  onPageSizeChange,
}: CronRunsTableProps) {
  return (
    <>
      <div className="product-table-wrap" style={{ border: "none", borderRadius: 0 }}>
        {filteredRuns.length === 0 ? (
          <div style={{ padding: "36px 16px", textAlign: "center" }}>
            <EmptyState text="هیچ اجرایی با فیلترهای انتخابی یافت نشد." />
            <button
              type="button"
              className="primary-button run-collection-btn"
              onClick={onRunTest}
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
                  <td>
                    <SourceBadge source={row.trigger_source} />
                  </td>

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
                  <td style={{ fontSize: "12.5px", color: "var(--muted)" }}>
                    <DateTime value={row.started_at} />
                  </td>

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
                      onClick={() => onOpenDetail(row.id)}
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
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      )}
    </>
  );
}
