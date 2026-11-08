import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNumber, formatPercentChange } from "../../../lib/formatters";
import { DateTime } from "@/components/common/DateTime";
import { ProductTableRowProps } from "./types";
import { ProductStatusSwitch } from "./ProductStatusSwitch";
import { ProductKebabMenu } from "./ProductKebabMenu";

export function ProductTableRow({
  product,
  isAdmin,
  basePath,
  showPublicIndicator = false,
  isToggling,
  isKebabOpen,
  busyAction,
  copiedKey,
  kebabTriggerRef,
  onToggleKebab,
  onCloseKebab,
  onEdit,
  onToggle,
  onRefresh,
  onDelete,
  onCopyUrl,
}: ProductTableRowProps) {
  const router = useRouter();
  const isActive = product.enabled_target_count > 0;
  const canToggle = product.target_count > 0;
  const hasPrimaryTarget = Boolean(product.primary_target);
  const canEdit = Boolean(product.can_edit || isAdmin);
  const detailUrl = `${basePath}/products/${encodeURIComponent(product.key)}`;

  return (
    <tr
      className={`product-table-row clickable-row ${isActive ? "is-active" : "is-inactive"} ${isAdmin ? "is-admin-row" : ""} ${canEdit ? "can-edit" : ""}`}
      tabIndex={0}
      role="link"
      aria-label={`مشاهده جزئیات ${product.title}`}
      onClick={() => router.push(detailUrl)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          router.push(detailUrl);
        }
      }}
    >
      {/* 1. Title & Slug (bold title with 2-line clamp, bidi handling, full tooltip) */}
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
            {showPublicIndicator && product.is_public ? (() => {
              const is24Hours =
                product.key === "usd" ||
                ((product.active_start_hour === 0 || product.active_start_hour === undefined || product.active_start_hour === null) &&
                  (product.active_end_hour === 23 || product.active_end_hour === undefined || product.active_end_hour === null)) ||
                (product.active_start_hour === 0 && product.active_end_hour === 23);

              return (
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
              );
            })() : null}
          </div>
          <span className="product-row-slug" title={product.key} dir="ltr">
            {product.key}
          </span>
        </div>
      </td>

      {/* Owner Column for Admin */}
      {isAdmin && (
        <td className="col-owner" onClick={(e) => e.stopPropagation()}>
          <div className="product-info-text">
            {product.owner_username ? (
              <span
                className="adapter-badge generic_html"
                title={`مالک کالا: ${product.owner_username}`}
              >
                {product.owner_username}
              </span>
            ) : product.is_public ? (
              <span className="adapter-badge public-badge" title="کالای عمومی سیستم">
                سیستم (عمومی)
              </span>
            ) : (
              <span className="muted-text">-</span>
            )}
          </div>
        </td>
      )}

      {/* 2. Source Badge */}
      <td className="col-source" onClick={(e) => e.stopPropagation()}>
        <div className="product-info-text">
          {product.sources.length > 0 ? (
            <div className="source-badges-cell">
              {product.sources.map((source) => (
                <span
                  key={source}
                  className={`adapter-badge ${source}`}
                  title={`منبع پایش: ${source}`}
                >
                  {source}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 3. Address Column */}
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

      {/* 4. Price Column */}
      <td className="col-price">
        <div className="product-info-text">
          {product.latestSnapshot?.price_toman !== undefined &&
          product.latestSnapshot.price_toman !== null ? (
            <div className="price-cell-stacked">
              <div className="price-value-line">
                <span className="product-price-value">
                  {formatNumber(product.latestSnapshot.price_toman)}
                </span>
                <span className="product-price-unit">تومان</span>
              </div>
              {product.latestSnapshot.diff_percent !== undefined &&
              product.latestSnapshot.diff_percent !== null ? (
                <span
                  className={`price-change-pill ${
                    (product.latestSnapshot.diff_toman ?? 0) > 0
                      ? "is-up"
                      : (product.latestSnapshot.diff_toman ?? 0) < 0
                      ? "is-down"
                      : "is-neutral"
                  }`}
                  title={
                    (product.latestSnapshot.diff_toman ?? 0) === 0
                      ? `بدون تغییر نسبت به قیمت قبلی (${formatNumber(product.latestSnapshot.previous_price_toman)} تومان)`
                      : `${(product.latestSnapshot.diff_toman ?? 0) > 0 ? "افزایش" : "کاهش"} نسبت به قیمت قبلی (${formatNumber(product.latestSnapshot.previous_price_toman)} تومان): ${(product.latestSnapshot.diff_toman ?? 0) > 0 ? "+" : ""}${formatNumber(product.latestSnapshot.diff_toman)} تومان`
                  }
                  aria-label={
                    (product.latestSnapshot.diff_toman ?? 0) === 0
                      ? "بدون تغییر"
                      : `${(product.latestSnapshot.diff_toman ?? 0) > 0 ? "افزایش" : "کاهش"} ${formatPercentChange(product.latestSnapshot.diff_percent)}`
                  }
                >
                  {(product.latestSnapshot.diff_toman ?? 0) > 0 ? (
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
                  ) : (product.latestSnapshot.diff_toman ?? 0) < 0 ? (
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
                    {formatPercentChange(product.latestSnapshot.diff_percent)}
                  </span>
                </span>
              ) : null}
            </div>
          ) : (
            <span className="price-empty-state" title="هنوز قیمتی ثبت نشده است">
              —
            </span>
          )}
        </div>
      </td>

      {/* 5. Status Column (Interactive Switch for editable, Static Badge for read-only public) */}
      <td className="col-status" onClick={(e) => e.stopPropagation()}>
        <ProductStatusSwitch
          product={product}
          canEdit={canEdit}
          isActive={isActive}
          canToggle={canToggle}
          isToggling={isToggling}
          onToggle={onToggle}
        />
      </td>

      {/* 6. Last Check Observation Time */}
      <td className="col-date">
        <div className="product-info-text">
          <DateTime
            value={product.latestSnapshot?.observed_at}
            showIcon
            className="product-date-text muted-text"
            emptyText="-"
          />
        </div>
      </td>

      {/* 7. Actions */}
      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        <div className="product-actions-cell">
          {canEdit ? (
            <>
              {/* Edit Icon Button */}
              <button
                type="button"
                className="action-icon-button"
                onClick={onEdit}
                disabled={!hasPrimaryTarget || busyAction !== null}
                aria-label={`ویرایش ${product.title}`}
                title="ویرایش محصول"
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

              {/* Kebab (⋯) Menu */}
              <ProductKebabMenu
                product={product}
                isKebabOpen={isKebabOpen}
                kebabTriggerRef={kebabTriggerRef}
                busyAction={busyAction}
                copiedKey={copiedKey}
                onToggleKebab={onToggleKebab}
                onCloseKebab={onCloseKebab}
                onRefresh={onRefresh}
                onDelete={onDelete}
                onCopyUrl={onCopyUrl}
                onEdit={onEdit}
              />
            </>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>
    </tr>
  );
}
