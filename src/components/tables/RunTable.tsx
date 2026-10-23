import React from "react";
import { RunRow } from "../../types/dashboard";
import { formatNumber, formatDate, statusText } from "../../lib/formatters";
import { DataTable } from "../common/DataTable";
import { StatusPill } from "../common/StatusPill";

interface RunTableProps {
  rows: RunRow[];
  compact?: boolean;
}

export function RunTable({ rows, compact = false }: RunTableProps) {
  return (
    <DataTable emptyText="run ثبت نشده است." compact={compact}>
      <thead>
        <tr>
          <th>ID</th>
          <th>وضعیت</th>
          <th>هدف</th>
          <th>موفق</th>
          <th>خطا</th>
          <th>شروع</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{formatNumber(row.id)}</td>
            <td>
              <StatusPill text={statusText(row.status)} tone={row.status} />
            </td>
            <td>{formatNumber(row.target_count)}</td>
            <td>{formatNumber(row.success_count)}</td>
            <td>{formatNumber(row.error_count)}</td>
            <td>{formatDate(row.started_at)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
