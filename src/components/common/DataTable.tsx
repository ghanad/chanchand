import React from "react";
import { EmptyState } from "./EmptyState";

interface DataTableProps {
  children: React.ReactNode;
  emptyText: string;
  compact?: boolean;
}

export function DataTable({ children, emptyText, compact }: DataTableProps) {
  const body = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && child.type === "tbody",
  ) as React.ReactElement<{ children?: React.ReactNode }> | undefined;
  const hasRows = body ? React.Children.count(body.props.children) > 0 : true;

  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
      <table>{children}</table>
      {!hasRows ? <EmptyState text={emptyText} /> : null}
    </div>
  );
}
