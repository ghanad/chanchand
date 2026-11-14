import React from "react";
import Link from "next/link";
import { ProductItemWithPrice } from "./types";
import { describeCollectionSchedule } from "@/lib/schedule";

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
  const schedule = describeCollectionSchedule(
    product.active_start_hour,
    product.active_end_hour
  );

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
              title={`کالای بازار عمومی — جمع‌آوری ${schedule.summary}`}
              aria-label={`کالای بازار عمومی، جمع‌آوری ${schedule.summary}`}
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
              <span className="public-indicator-text">
                عمومی · {schedule.durationLabel}
              </span>
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
