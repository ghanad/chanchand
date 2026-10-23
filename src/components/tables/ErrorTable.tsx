import React from "react";
import { ErrorRow } from "../../types/dashboard";
import { formatDate } from "../../lib/formatters";
import { DataTable } from "../common/DataTable";

interface ErrorTableProps {
  rows: ErrorRow[];
}

export function ErrorTable({ rows }: ErrorTableProps) {
  return (
    <DataTable emptyText="خطایی ثبت نشده است.">
      <thead>
        <tr>
          <th>محصول</th>
          <th>منبع</th>
          <th>نوع</th>
          <th>پیام</th>
          <th>زمان</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.product_key}</td>
            <td>{row.source_key}</td>
            <td>{row.error_type}</td>
            <td className="message-cell">{row.message}</td>
            <td>{formatDate(row.observed_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
