import React from "react";
import Link from "next/link";
import { ProductItemWithPrice } from "./types";

interface ProductTitleCellProps {
  product: ProductItemWithPrice;
  detailUrl: string;
  showPublicIndicator?: boolean;
}

export function ProductTitleCell({
  product,
  detailUrl,
  showPublicIndicator = false,
}: ProductTitleCellProps) {
  const is24Hours =
    product.key === "usd" ||
    ((product.active_start_hour === 0 || product.active_start_hour === undefined || product.active_start_hour === null) &&
      (product.active_end_hour === 23 || product.active_end_hour === undefined || product.active_end_hour === null)) ||
    (product.active_start_hour === 0 && product.active_end_hour === 23);

  return (
    <td className="col-title">
      <div className="product-title-cell product-info-text">
        <div className="product-title-line">
          <Link
            href={detailUrl}
            className="product-row-title-link"
            title={product.title}
            onClick={(e) => e.stopPropagation()}
          >
            <strong className="product-row-title" title={product.title} dir="auto">
              {product.title}
            </strong>
          </Link>
          {showPublicIndicator && product.is_public ? (
            <span
              className="public-market-indicator"
              title={
                is24Hours
                  ? "کالای بازار عمومی (جمع‌آوری ۲۴ ساعته شبانه‌روزی)"
                  : `کالای بازار عمومی (ساعت جمع‌آوری: ${String(product.active_start_hour ?? 0).padStart(2, "0")}:00 تا ${String(product.active_end_hour ?? 23).padStart(2, "0")}:00)`
              }
              aria-label="کالای بازار عمومی"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="public-indicator-text">عمومی {is24Hours ? "(۲۴ ساعته)" : ""}</span>
            </span>
          ) : null}
        </div>
        <span className="product-row-slug" title={product.key} dir="ltr">
          {product.key}
        </span>
      </div>
    </td>
  );
}
