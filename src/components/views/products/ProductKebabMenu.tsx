import React from "react";
import { ProductItemWithPrice } from "./types";

interface ProductKebabMenuProps {
  product: ProductItemWithPrice;
  isKebabOpen: boolean;
  kebabTriggerRef?: React.RefObject<HTMLButtonElement | null> | ((el: HTMLButtonElement | null) => void);
  busyAction: string | null;
  copiedKey: string | null;
  onToggleKebab: () => void;
  onCloseKebab: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  onCopyUrl: (url: string) => void;
}

export function ProductKebabMenu({
  product,
  isKebabOpen,
  kebabTriggerRef,
  busyAction,
  copiedKey,
  onToggleKebab,
  onCloseKebab,
  onRefresh,
  onDelete,
  onCopyUrl,
}: ProductKebabMenuProps) {
  return (
    <div className="kebab-container">
      <button
        type="button"
        ref={kebabTriggerRef}
        className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
        onClick={onToggleKebab}
        aria-label={`عملیات بیشتر برای ${product.title}`}
        aria-haspopup="menu"
        aria-expanded={isKebabOpen}
        title="عملیات بیشتر"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            onToggleKebab();
          }
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="12" r="2" />
        </svg>
      </button>

      {isKebabOpen && (
        <div
          className="kebab-menu-dropdown"
          role="menu"
          aria-orientation="vertical"
          tabIndex={-1}
        >
          <button
            type="button"
            role="menuitem"
            className="kebab-menu-item"
            onClick={() => {
              onCloseKebab();
              onRefresh();
            }}
            disabled={busyAction !== null || product.enabled_target_count === 0}
            title={
              product.enabled_target_count === 0
                ? "محصول هدف فعالی ندارد"
                : "استعلام آنلاین و فوری قیمت این کالا"
            }
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
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>استعلام فوری قیمت</span>
          </button>

          {product.primary_target?.url && (
            <>
              <button
                type="button"
                role="menuitem"
                className="kebab-menu-item"
                onClick={() => {
                  onCloseKebab();
                  onCopyUrl(product.primary_target!.url);
                }}
                title="کپی آدرس منبع قیمت‌گیری در کلیپ‌بورد"
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
                <span>{copiedKey === product.key ? "کپی شد!" : "کپی لینک منبع"}</span>
              </button>

              <a
                href={product.primary_target.url}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                className="kebab-menu-item"
                onClick={onCloseKebab}
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
                <span>مشاهده در تب جدید</span>
              </a>
            </>
          )}

          <div className="kebab-menu-divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="kebab-menu-item danger"
            onClick={() => {
              onCloseKebab();
              onDelete();
            }}
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            <span>حذف محصول</span>
          </button>
        </div>
      )}
    </div>
  );
}
