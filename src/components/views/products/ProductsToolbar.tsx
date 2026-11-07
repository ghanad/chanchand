import React from "react";
import { formatNumber } from "../../../lib/formatters";
import { ProductTab, SortField, SortDirection } from "./types";

interface ProductsToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: ProductTab;
  setActiveTab: (tab: ProductTab) => void;
  allCount: number;
  personalCount: number;
  publicCount: number;
  sortField?: SortField | null;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField | null, direction: SortDirection) => void;
}

export function ProductsToolbar({
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  allCount,
  personalCount,
  publicCount,
  sortField,
  sortDirection = "asc",
  onSortChange,
}: ProductsToolbarProps) {
  return (
    <div className="product-table-toolbar">
      <div className="product-search-wrapper">
        <span className="product-search-icon" aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          className="product-search-input"
          placeholder="جستجوی محصول، منبع، شناسه..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="جستجوی محصولات"
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

      <div className="toolbar-controls-group">
        <div className="status-filter-pills" role="tablist" aria-label="دسته‌بندی محصولات">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`filter-pill-btn ${activeTab === "all" ? "is-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            همه ({formatNumber(allCount)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "personal"}
            className={`filter-pill-btn ${activeTab === "personal" ? "is-active" : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            محصولات من ({formatNumber(personalCount)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "public"}
            className={`filter-pill-btn ${activeTab === "public" ? "is-active" : ""}`}
            onClick={() => setActiveTab("public")}
          >
            بازار عمومی ({formatNumber(publicCount)})
          </button>
        </div>

        {onSortChange && (
          <div className="mobile-sort-container">
            <span className="mobile-sort-icon" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="21" y1="10" x2="7" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="11" y2="14" />
                <line x1="21" y1="18" x2="7" y2="18" />
              </svg>
            </span>
            <select
              className="mobile-sort-select"
              value={sortField ? `${sortField}_${sortDirection}` : "default"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "default") {
                  onSortChange(null, "asc");
                } else {
                  const [field, dir] = val.split("_") as [SortField, SortDirection];
                  onSortChange(field, dir);
                }
              }}
              aria-label="مرتب‌سازی محصولات"
            >
              <option value="default">مرتب‌سازی: پیش‌فرض</option>
              <option value="price_asc">قیمت: ارزان‌ترین</option>
              <option value="price_desc">قیمت: گران‌ترین</option>
              <option value="date_desc">استعلام: جدیدترین</option>
              <option value="date_asc">استعلام: قدیمی‌ترین</option>
              <option value="title_asc">عنوان: الف - ی</option>
              <option value="title_desc">عنوان: ی - الف</option>
              <option value="status_desc">وضعیت: فعال‌ها اول</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
