import React from "react";
import { RunStatus } from "../../types/dashboard";

interface MetricProps {
  label: string;
  value: string;
  tone?: RunStatus | null;
}

export function Metric({ label, value, tone }: MetricProps) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ""}>{value}</strong>
    </article>
  );
}
