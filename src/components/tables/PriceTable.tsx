import React from "react";
import { PriceRow } from "../../types/dashboard";
import { formatNumber, formatDate, availabilityText } from "../../lib/formatters";
import { DataTable } from "../common/DataTable";
import { StatusPill } from "../common/StatusPill";

interface PriceTableProps {
  rows: PriceRow[];
  compact?: boolean;
}

export function PriceTable({ rows, compact = false }: PriceTableProps) {
  return (
    <DataTable emptyText="هنوز snapshot قیمت ثبت نشده است." compact={compact}>
      <thead>
        <tr>
          <th>محصول</th>
          <th>منبع</th>
          <th>قیمت تومان</th>
          <th>وضعیت</th>
          <th>فروشنده</th>
          <th>زمان</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.title || row.product_key}</td>
            <td>{row.source_key}</td>
            <td>{formatNumber(row.price_toman)}</td>
            <td>
              <StatusPill text={availabilityText(row.availability)} tone={row.availability} />
            </td>
            <td>{row.seller || "-"}</td>
            <td>{formatDate(row.observed_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
