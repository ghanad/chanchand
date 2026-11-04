import React from "react";
import { formatNumber } from "@/lib/formatters";
import { SourceStatusFilter } from "./types";

interface SourcesToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: SourceStatusFilter;
  setStatusFilter: (filter: SourceStatusFilter) => void;
  totalSources: number;
  totalInUse: number;
  totalUnused: number;
}

export function SourcesToolbar({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  totalSources,
  totalInUse,
  totalUnused,
}: SourcesToolbarProps) {
  return (
    <div className="product-table-toolbar">
      <div className="product-search-wrapper">
        <span className="product-search-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          className="product-search-input"
          placeholder="جستجو در شناسه منبع، نوع آداپتور، ارز..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="جستجوی منابع"
        />
        {searchQuery && (
          <button
            type="button"
            className="product-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label="پاک کردن متن جستجو"
            title="پاک کردن"
          >
            ✕
          </button>
        )}
      </div>

      <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر وضعیت استفاده منبع">
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "all"}
          className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          همه ({formatNumber(totalSources)})
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "in_use"}
          className={`filter-pill-btn ${statusFilter === "in_use" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("in_use")}
        >
          متصل به هدف ({formatNumber(totalInUse)})
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "unused"}
          className={`filter-pill-btn ${statusFilter === "unused" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("unused")}
        >
          بدون هدف ({formatNumber(totalUnused)})
        </button>
      </div>
    </div>
  );
}
