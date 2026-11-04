import React from "react";
import { formatNumber } from "@/lib/formatters";
import { UserRoleFilter } from "./types";

interface UsersToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: UserRoleFilter;
  setStatusFilter: (filter: UserRoleFilter) => void;
  totalUsers: number;
  adminCount: number;
  viewerCount: number;
}

export function UsersToolbar({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  totalUsers,
  adminCount,
  viewerCount,
}: UsersToolbarProps) {
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
          placeholder="جستجو در نام کاربری، ایمیل یا موبایل..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="جستجوی کاربران"
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

      <div className="status-filter-pills" role="radiogroup" aria-label="فیلتر نقش کاربران">
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "all"}
          className={`filter-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          همه ({formatNumber(totalUsers)})
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "admin"}
          className={`filter-pill-btn ${statusFilter === "admin" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("admin")}
        >
          مدیران ({formatNumber(adminCount)})
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={statusFilter === "viewer"}
          className={`filter-pill-btn ${statusFilter === "viewer" ? "is-active" : ""}`}
          onClick={() => setStatusFilter("viewer")}
        >
          بینندگان ({formatNumber(viewerCount)})
        </button>
      </div>
    </div>
  );
}
