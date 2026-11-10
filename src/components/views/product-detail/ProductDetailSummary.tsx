import React from "react";
import { PriceRow } from "@/types/dashboard";
import { formatNumber, formatDate } from "@/lib/formatters";

interface ProductDetailSummaryProps {
  latestSnapshot: PriceRow | null;
  isPublicProduct?: boolean;
  showUsd?: boolean;
  minToman: number | null;
  maxToman: number | null;
  minUsd: number | null;
  maxUsd: number | null;
  historyLength: number;
}

export function ProductDetailSummary({
  latestSnapshot,
  isPublicProduct = false,
  showUsd,
  minToman,
  maxToman,
  minUsd,
  maxUsd,
  historyLength,
}: ProductDetailSummaryProps) {
  const canShowUsd = showUsd !== undefined ? showUsd : !isPublicProduct;

  const hasLatestPrice =
    latestSnapshot?.price_toman !== null && latestSnapshot?.price_toman !== undefined;

  const latestHint =
    canShowUsd && latestSnapshot?.price_usd
      ? `معادل ${formatNumber(latestSnapshot.price_usd)} دلار`
      : latestSnapshot?.seller
      ? `فروشنده: ${latestSnapshot.seller}`
      : undefined;

  const minHint =
    canShowUsd && minUsd !== null ? `معادل ${formatNumber(minUsd)} دلار` : undefined;

  const maxHint =
    canShowUsd && maxUsd !== null ? `معادل ${formatNumber(maxUsd)} دلار` : undefined;

  const historyHint = latestSnapshot?.observed_at
    ? `آخرین: ${formatDate(latestSnapshot.observed_at)}`
    : undefined;

  return (
    <section className="product-summary-grid" aria-label="شاخص‌های کلیدی محصول">
      {/* 1. Latest Price */}
      <article className="metric-card product-metric-card stat-latest">
        <div className="metric-header">
          <span className="metric-label">آخرین قیمت ثبت‌شده</span>
          <span className="metric-icon-wrap" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </span>
        </div>
        <div className="metric-value-wrap">
          {hasLatestPrice ? (
            <>
              <strong className="metric-value-num">{formatNumber(latestSnapshot!.price_toman!)}</strong>
              <span className="metric-currency">تومان</span>
            </>
          ) : (
            <strong className="metric-value-num is-empty">ثبت نشده</strong>
          )}
        </div>
        {latestHint ? (
          <small className="metric-hint" title={latestHint}>{latestHint}</small>
        ) : (
          <div className="metric-hint-placeholder" />
        )}
      </article>

      {/* 2. Lowest Price */}
      <article className="metric-card product-metric-card stat-min">
        <div className="metric-header">
          <span className="metric-label">کمترین قیمت تاریخی</span>
          <span className="metric-icon-wrap" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </svg>
          </span>
        </div>
        <div className="metric-value-wrap">
          {minToman !== null ? (
            <>
              <strong className="metric-value-num">{formatNumber(minToman)}</strong>
              <span className="metric-currency">تومان</span>
            </>
          ) : (
            <strong className="metric-value-num is-empty">-</strong>
          )}
        </div>
        {minHint ? (
          <small className="metric-hint" title={minHint}>{minHint}</small>
        ) : (
          <div className="metric-hint-placeholder" />
        )}
      </article>

      {/* 3. Highest Price */}
      <article className="metric-card product-metric-card stat-max">
        <div className="metric-header">
          <span className="metric-label">بیشترین قیمت تاریخی</span>
          <span className="metric-icon-wrap" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </span>
        </div>
        <div className="metric-value-wrap">
          {maxToman !== null ? (
            <>
              <strong className="metric-value-num">{formatNumber(maxToman)}</strong>
              <span className="metric-currency">تومان</span>
            </>
          ) : (
            <strong className="metric-value-num is-empty">-</strong>
          )}
        </div>
        {maxHint ? (
          <small className="metric-hint" title={maxHint}>{maxHint}</small>
        ) : (
          <div className="metric-hint-placeholder" />
        )}
      </article>

      {/* 4. Total Observations */}
      <article className="metric-card product-metric-card stat-history">
        <div className="metric-header">
          <span className="metric-label">تعداد کل مشاهدات</span>
          <span className="metric-icon-wrap" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
        </div>
        <div className="metric-value-wrap">
          <strong className="metric-value-num">{formatNumber(historyLength)}</strong>
          <span className="metric-currency">ثبت</span>
        </div>
        {historyHint ? (
          <small className="metric-hint" title={historyHint}>{historyHint}</small>
        ) : (
          <div className="metric-hint-placeholder" />
        )}
      </article>
    </section>
  );
}
