import React from "react";
import { formatNumber } from "@/lib/formatters";
import { Metric } from "@/components/common/Metric";

interface SourcesSummaryProps {
  totalSources: number;
  uniqueAdapters: number;
  activeTargets: number;
  totalTargets: number;
  avgRateLimit: string;
}

export function SourcesSummary({
  totalSources,
  uniqueAdapters,
  activeTargets,
  totalTargets,
  avgRateLimit,
}: SourcesSummaryProps) {
  return (
    <section className="product-summary-grid" aria-label="خلاصه آمار منابع">
      <Metric label="کل منابع قیمت‌گیری" value={formatNumber(totalSources)} />
      <Metric label="آداپتورهای فعال" value={formatNumber(uniqueAdapters)} />
      <Metric
        label="هدف‌های متصل (فعال)"
        value={`${formatNumber(activeTargets)} / ${formatNumber(totalTargets)}`}
      />
      <Metric label="میانگین نرخ وقفه" value={`${avgRateLimit} ثانیه`} />
    </section>
  );
}
