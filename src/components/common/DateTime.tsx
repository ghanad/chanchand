import React from "react";
import { splitDateTime, PERSIAN_COMMA } from "@/lib/formatters";

export interface DateTimeProps {
  value: string | null | undefined;
  showIcon?: boolean;
  className?: string;
  separator?: string;
  emptyText?: string;
}

export function DateTime({
  value,
  showIcon = false,
  className = "",
  separator = PERSIAN_COMMA,
  emptyText = "-",
}: DateTimeProps) {
  if (!value) {
    return <span className={`datetime-empty ${className}`}>{emptyText}</span>;
  }

  const parts = splitDateTime(value);
  if (!parts) {
    return <span className={`datetime-fallback ${className}`}>{value}</span>;
  }

  const { date, time } = parts;

  return (
    <span dir="rtl" className={`datetime-badge ${className}`} title={value}>
      <span className="datetime-date">
        <bdi>{date}</bdi>
      </span>
      <span className="datetime-sep">{separator}</span>
      <span className="datetime-time">
        {showIcon && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="datetime-clock-icon"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        )}
        <bdi>{time}</bdi>
      </span>
    </span>
  );
}
