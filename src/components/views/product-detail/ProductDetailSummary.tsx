import React from "react";
import { PriceRow } from "@/types/dashboard";
import { formatNumber, formatDate } from "@/lib/formatters";
import { Metric } from "@/components/common/Metric";

interface ProductDetailSummaryProps {
  latestSnapshot: PriceRow | null;
  isPublicProduct: boolean;
  minToman: number | null;
  maxToman: number | null;
  minUsd: number | null;
  maxUsd: number | null;
  historyLength: number;
}

export function ProductDetailSummary({
  latestSnapshot,
  isPublicProduct,
  minToman,
  maxToman,
  minUsd,
  maxUsd,
  historyLength,
}: ProductDetailSummaryProps) {
  return (
    <section className="product-summary-grid" aria-label="شاخص‌های کلیدی محصول">
      <Metric
        label="آخرین قیمت ثبت‌شده"
        value={
          latestSnapshot?.price_toman !== null && latestSnapshot?.price_toman !== undefined
            ? `${formatNumber(latestSnapshot.price_toman)} تومان`
            : "ثبت نشده"
        }
        hint={
          !isPublicProduct && latestSnapshot?.price_usd
            ? `معادل ${formatNumber(latestSnapshot.price_usd)} دلار`
            : latestSnapshot?.seller
            ? `فروشنده: ${latestSnapshot.seller}`
            : undefined
        }
      />
      <Metric
        label="کمترین قیمت تاریخی"
        value={minToman !== null ? `${formatNumber(minToman)} تومان` : "-"}
        hint={!isPublicProduct && minUsd !== null ? `معادل ${formatNumber(minUsd)} دلار` : undefined}
      />
      <Metric
        label="بیشترین قیمت تاریخی"
        value={maxToman !== null ? `${formatNumber(maxToman)} تومان` : "-"}
        hint={!isPublicProduct && maxUsd !== null ? `معادل ${formatNumber(maxUsd)} دلار` : undefined}
      />
      <Metric
        label="تعداد کل مشاهدات"
        value={formatNumber(historyLength)}
        hint={latestSnapshot?.observed_at ? `آخرین: ${formatDate(latestSnapshot.observed_at)}` : undefined}
      />
    </section>
  );
}
