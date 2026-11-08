import React from "react";
import { ProductItemWithPrice } from "./types";

interface ProductUrlCellProps {
  product: ProductItemWithPrice;
  isAdmin: boolean;
  copiedKey: string | null;
  onCopyUrl: (url: string) => void;
}

export function ProductUrlCell({
  product,
  isAdmin,
  copiedKey,
  onCopyUrl,
}: ProductUrlCellProps) {
  return (
    <td className="col-url" onClick={(e) => e.stopPropagation()}>
      <div className="product-info-text">
        {product.is_public && !isAdmin ? (
          <span
            className="public-link-badge"
            title="کالای پایش عمومی سیستم — لینک اختصاصی در حالت اشتراکی نمایش داده نمی‌شود"
          >
            کالای عمومی
          </span>
        ) : product.primary_target?.url ? (
          <div className="url-action-group">
            <a
              href={product.primary_target.url}
              target="_blank"
              rel="noopener noreferrer"
              className="action-icon-button external-link-btn"
              aria-label={`مشاهده منبع ${product.title}`}
              title="مشاهده صفحه منبع در تب جدید"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <button
              type="button"
              className={`action-icon-button copy-link-btn ${copiedKey === product.key ? "copied" : ""}`}
              onClick={() => onCopyUrl(product.primary_target!.url)}
              aria-label={`کپی لینک منبع برای ${product.title}`}
              title={copiedKey === product.key ? "کپی شد!" : "کپی لینک منبع"}
            >
              {copiedKey === product.key ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ok)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <span className="muted-text">-</span>
        )}
      </div>
    </td>
  );
}
