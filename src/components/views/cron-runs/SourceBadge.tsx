import React from "react";
import { triggerSourceText } from "@/lib/formatters";

interface SourceBadgeProps {
  source: string | null | undefined;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const isCron = source === "cron";
  const isApi = source === "api";

  if (isCron) {
    return (
      <span
        className="status-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          background: "rgba(124, 58, 237, 0.09)",
          color: "#7c3aed",
          border: "1px solid rgba(124, 58, 237, 0.2)",
          fontWeight: 600,
          fontSize: "11.5px",
          padding: "2px 8px",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>کرون (Cron)</span>
      </span>
    );
  }

  if (isApi) {
    return (
      <span
        className="status-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          background: "rgba(2, 132, 199, 0.09)",
          color: "#0284c7",
          border: "1px solid rgba(2, 132, 199, 0.2)",
          fontWeight: 600,
          fontSize: "11.5px",
          padding: "2px 8px",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <span>فراخوانی API</span>
      </span>
    );
  }

  return (
    <span
      className="status-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: "var(--surface-soft)",
        color: "var(--muted)",
        border: "1px solid var(--line)",
        fontWeight: 500,
        fontSize: "11.5px",
        padding: "2px 8px",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span>{triggerSourceText(source)}</span>
    </span>
  );
}
