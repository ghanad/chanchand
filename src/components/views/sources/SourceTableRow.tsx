import React from "react";
import { createPortal } from "react-dom";
import { SourceRow } from "@/types/dashboard";
import { formatNumber } from "@/lib/formatters";
import { MenuCoords } from "./types";

interface SourceTableRowProps {
  source: SourceRow;
  isAdmin: boolean;
  busyAction: string | null;
  isKebabOpen: boolean;
  menuCoords: MenuCoords | null;
  kebabTriggerRef: (el: HTMLButtonElement | null) => void;
  onToggleKebab: () => void;
  onOpenEdit: (source: SourceRow) => void;
  onDeleteClick: (source: SourceRow) => void;
  onCloseKebab: () => void;
}

export function getMonogram(key: string): string {
  if (key.startsWith("digikala")) return "DK";
  if (key.startsWith("brsapi")) return "BR";
  if (key.startsWith("generic")) return "GH";
  return key.slice(0, 2).toUpperCase();
}

export function getBadgeClass(adapter: string): string {
  if (adapter.includes("digikala")) return "digikala_api";
  if (adapter.includes("brsapi")) return "brsapi_market";
  if (adapter.includes("generic")) return "generic_html";
  return "default";
}

export function SourceTableRow({
  source,
  isAdmin,
  busyAction,
  isKebabOpen,
  menuCoords,
  kebabTriggerRef,
  onToggleKebab,
  onOpenEdit,
  onDeleteClick,
  onCloseKebab,
}: SourceTableRowProps) {
  const targetCount = source.target_count || 0;
  const enabledTargets = source.enabled_target_count || 0;
  const productCount = source.product_count || 0;
  const isUnused = targetCount === 0;

  return (
    <tr
      className={`product-table-row source-table-row ${isUnused ? "is-inactive" : "is-active"}`}
    >
      {/* ۱. شناسه منبع */}
      <td className="source-col-key">
        <div className="source-key-group product-info-text">
          <span className="source-mini-badge" aria-hidden="true">
            {getMonogram(source.key)}
          </span>
          <strong className="source-key-text" title={source.key}>
            {source.key}
          </strong>
        </div>
      </td>

      {/* ۲. نوع آداپتور */}
      <td className="source-col-adapter">
        <div className="product-info-text">
          <span className={`adapter-badge ${getBadgeClass(source.adapter)}`}>
            {source.adapter}
          </span>
        </div>
      </td>

      {/* ۳. نرخ وقفه و مهلت زمانی */}
      <td className="source-col-rate">
        <div className="product-info-text">
          <span className="source-tabular-val">
            {source.rate_limit_seconds !== undefined ? `${source.rate_limit_seconds}s` : "-"} /{" "}
            {source.timeout_seconds !== undefined ? `${source.timeout_seconds}s` : "-"}
          </span>
          <span className="source-col-sub">وقفه / مهلت</span>
        </div>
      </td>

      {/* ۴. واحد پول و ضریب */}
      <td className="source-col-currency">
        <div className="product-info-text">
          <span className="source-tabular-val">
            {source.currency || "IRR"} ({source.price_multiplier !== undefined ? `× ${source.price_multiplier}` : "× 1"})
          </span>
        </div>
      </td>

      {/* ۵. اهداف و محصولات متصل */}
      <td className="source-col-usage">
        <div className="product-info-text">
          {targetCount > 0 ? (
            <span className="source-usage-text">
              {formatNumber(enabledTargets)} هدف فعال در {formatNumber(productCount)} محصول
            </span>
          ) : (
            <span className="source-usage-text muted">بدون هدف متصل</span>
          )}
        </div>
      </td>

      {/* ۶. عملیات: ویرایش و منوی کباب با حذف */}
      <td className="source-col-actions">
        {isAdmin ? (
          <div className="product-actions-cell">
            <button
              type="button"
              className="action-icon-button"
              onClick={() => onOpenEdit(source)}
              disabled={busyAction !== null}
              aria-label={`ویرایش منبع ${source.key}`}
              title="ویرایش منبع"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            <div className="kebab-container">
              <button
                type="button"
                ref={kebabTriggerRef}
                className={`action-icon-button kebab-trigger ${isKebabOpen ? "open" : ""}`}
                onClick={onToggleKebab}
                aria-label={`عملیات بیشتر برای ${source.key}`}
                aria-haspopup="menu"
                aria-expanded={isKebabOpen}
                title="عملیات بیشتر"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
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

              {isKebabOpen &&
                menuCoords &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    className="kebab-menu-dropdown kebab-portal-menu"
                    role="menu"
                    aria-orientation="vertical"
                    tabIndex={-1}
                    style={{
                      position: "fixed",
                      top: menuCoords.openUpwards ? "auto" : `${menuCoords.top}px`,
                      bottom: menuCoords.openUpwards
                        ? `${menuCoords.bottom}px`
                        : "auto",
                      left: `${menuCoords.left}px`,
                      zIndex: 9999,
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="kebab-menu-item danger"
                      onClick={() => {
                        onCloseKebab();
                        onDeleteClick(source);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          onCloseKebab();
                        }
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
                      <span>حذف منبع</span>
                    </button>
                  </div>,
                  document.body,
                )}
            </div>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
