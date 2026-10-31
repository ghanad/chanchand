import React from "react";
import { formatNumber } from "../../lib/formatters";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

function getPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);
  const pages = getPaginationRange(currentPage, totalPages);

  return (
    <div className="pagination-container" aria-label="صفحه‌بندی">
      <div className="pagination-meta">
        <span className="pagination-info">
          نمایش {formatNumber(startIndex)} تا {formatNumber(endIndex)} از {formatNumber(totalItems)} ردیف
        </span>

        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <div className="pagination-size-select">
            <label htmlFor="pagination-page-size">تعداد در صفحه:</label>
            <select
              id="pagination-page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="انتخاب تعداد ردیف در صفحه"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {formatNumber(opt)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="صفحه قبلی"
          >
            قبلی
          </button>

          <div className="pagination-pages">
            {pages.map((p, idx) => {
              if (p === "...") {
                return (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                    ...
                  </span>
                );
              }
              const isActive = p === currentPage;
              return (
                <button
                  key={p}
                  type="button"
                  className={`pagination-btn pagination-page-btn ${isActive ? "active" : ""}`}
                  onClick={() => onPageChange(p)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`صفحه ${formatNumber(p)}`}
                >
                  {formatNumber(p)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="pagination-btn pagination-nav-btn"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="صفحه بعدی"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
