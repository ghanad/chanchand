import React from "react";
import { formatNumber } from "../../../lib/formatters";
import { ProductTab } from "./types";

interface ProductsToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: ProductTab;
  setActiveTab: (tab: ProductTab) => void;
  allCount: number;
  personalCount: number;
  publicCount: number;
}

export function ProductsToolbar({
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  allCount,
  personalCount,
  publicCount,
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
          placeholder="جستجو در عنوان، شناسه، آدرس یا منبع..."
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
    </div>
  );
}
