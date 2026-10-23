import React from "react";
import { RunStatus } from "../../types/dashboard";

interface MetricProps {
  label: string;
  value: string;
  tone?: RunStatus | null;
  hint?: string;
}

export function Metric({ label, value, tone, hint }: MetricProps) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
      {hint && <small className="metric-hint">{hint}</small>}
    </article>
  );
}
