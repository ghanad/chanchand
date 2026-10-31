import React, { useState, useEffect } from "react";
import { PriceRow } from "../../types/dashboard";
import { formatNumber, formatDate, availabilityText, productLinkUrl } from "../../lib/formatters";
import { DataTable } from "../common/DataTable";
import { StatusPill } from "../common/StatusPill";
import { Pagination } from "../common/Pagination";

interface HistoryTableProps {
  rows: PriceRow[];
  initialPageSize?: number;
}

export function HistoryTable({ rows, initialPageSize = 20 }: HistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  // Reset or clamp currentPage if rows length or pageSize changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="history-table-container">
      <DataTable emptyText="برای این محصول history ثبت نشده است.">
      <thead>
        <tr>
          <th>زمان</th>
          <th>منبع</th>
          <th>لینک</th>
          <th>تومان</th>
          <th>دلار</th>
          <th>نرخ دلار</th>
          <th>IRR</th>
          <th>وضعیت</th>
          <th>فروشنده</th>
        </tr>
      </thead>
      <tbody>
        {paginatedRows.map((row) => {
          const url = productLinkUrl(row);

          return (
            <tr key={row.id}>
              <td>{formatDate(row.observed_at)}</td>
              <td>{row.source_key}</td>
              <td>
                {url ? (
                  <a className="table-link" href={url} target="_blank" rel="noreferrer">
                    باز کردن
                  </a>
                ) : (
                  <span className="muted-cell">-</span>
                )}
              </td>
              <td>{formatNumber(row.price_toman)}</td>
              <td>{formatNumber(row.price_usd)}</td>
              <td>{formatNumber(row.usd_rate_toman)}</td>
              <td>{formatNumber(row.price_irr)}</td>
              <td>
                <StatusPill text={availabilityText(row.availability)} tone={row.availability} />
              </td>
              <td>{row.seller || "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>

    {rows.length > 0 && (
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={rows.length}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
      />
    )}
  </div>
  );
}
