import React from "react";
import { CronSourceFilter, CronStatusFilter } from "./types";

interface CronRunsToolbarProps {
  sourceFilter: string;
  setSourceFilter: (source: CronSourceFilter) => void;
  statusFilter: string;
  setStatusFilter: (status: CronStatusFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onFilterChange: () => void;
}

export function CronRunsToolbar({
  sourceFilter,
  setSourceFilter,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  onFilterChange,
}: CronRunsToolbarProps) {
  return (
    <div
      className="product-table-toolbar"
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--line)",
        marginBottom: 0,
      }}
    >
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
              onFilterChange();
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
              onFilterChange();
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
              onFilterChange();
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
              onFilterChange();
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
              onFilterChange();
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
              onFilterChange();
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
              onFilterChange();
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
            onFilterChange();
          }}
          aria-label="جستجوی اجراها"
        />
        {searchQuery && (
          <button
            type="button"
            className="product-search-clear"
            onClick={() => {
              setSearchQuery("");
              onFilterChange();
            }}
            aria-label="پاک کردن"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
