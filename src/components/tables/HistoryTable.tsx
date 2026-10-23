import React from "react";
import { PriceRow } from "../../types/dashboard";
import { formatNumber, formatDate, availabilityText, productLinkUrl } from "../../lib/formatters";
import { DataTable } from "../common/DataTable";
import { StatusPill } from "../common/StatusPill";

interface HistoryTableProps {
  rows: PriceRow[];
}

export function HistoryTable({ rows }: HistoryTableProps) {
  return (
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
        {rows.map((row) => {
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
  );
}
