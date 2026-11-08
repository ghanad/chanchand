import React from "react";
import { formatNumber, formatDate, formatPercentChange } from "../../../lib/formatters";
import { PriceRow } from "../../../types/dashboard";

interface ProductPriceCellProps {
  latestSnapshot?: PriceRow | null;
}

export function ProductPriceCell({ latestSnapshot }: ProductPriceCellProps) {
  if (!latestSnapshot || latestSnapshot.price_toman === undefined || latestSnapshot.price_toman === null) {
    return (
      <td className="col-price">
        <div className="product-info-text">
          <span className="price-empty-state" title="هنوز قیمتی ثبت نشده است">
            —
          </span>
        </div>
      </td>
    );
  }

  const { price_toman, diff_toman, diff_percent, previous_price_toman, previous_observed_at } = latestSnapshot;
  const numericDiffToman = diff_toman ?? 0;
  const hasDiff = diff_percent !== undefined && diff_percent !== null;

  return (
    <td className="col-price">
      <div className="product-info-text">
        <div className="price-cell-stacked">
          <div className="price-value-line">
            <span className="product-price-value">
              {formatNumber(price_toman)}
            </span>
            <span className="product-price-unit">تومان</span>
          </div>
          {hasDiff ? (
            <span
              className={`price-change-pill ${
                numericDiffToman > 0
                  ? "is-up"
                  : numericDiffToman < 0
                  ? "is-down"
                  : "is-neutral"
              }`}
              title={
                numericDiffToman === 0
                  ? `بدون تغییر قیمت (همواره ${formatNumber(price_toman)} تومان)`
                  : `${numericDiffToman > 0 ? "افزایش" : "کاهش"} نسبت به آخرین تغییر قیمت (${formatNumber(previous_price_toman)} تومان${previous_observed_at ? ` در ${formatDate(previous_observed_at)}` : ""}): ${numericDiffToman > 0 ? "+" : ""}${formatNumber(numericDiffToman)} تومان`
              }
              aria-label={
                numericDiffToman === 0
                  ? "بدون تغییر"
                  : `${numericDiffToman > 0 ? "افزایش" : "کاهش"} ${formatPercentChange(diff_percent)}`
              }
            >
              {numericDiffToman > 0 ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="price-change-arrow"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : numericDiffToman < 0 ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="price-change-arrow"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="price-change-arrow"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
              <span className="price-change-text" dir="ltr">
                {formatPercentChange(diff_percent)}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </td>
  );
}
