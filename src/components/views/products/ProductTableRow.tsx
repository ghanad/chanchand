import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNumber, formatDate } from "../../../lib/formatters";
import { ProductTableRowProps } from "./types";

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
      className={`product-table-row clickable-row ${isActive ? "is-active" : "is-inactive"}`}
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
            {showPublicIndicator && product.is_public ? (
              <span
                className="public-market-indicator"
                title="کالای بازار عمومی (مشترک بین تمام کاربران)"
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
              </span>
            ) : null}
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
            ) : (
              <span
                className="adapter-badge brsapi_market"
                title="کالای عمومی سیستم بدون مالک اختصاصی"
              >
                سیستم/عمومی
              </span>
            )}
          </div>
        </td>
      )}

      {/* 2. Source Badge */}
      <td className="col-source" onClick={(e) => e.stopPropagation()}>
        <div className="product-info-text">
          {product.sources.length ? (
            product.sources.map((source) => (
              <span className="product-source-badge" key={`${product.key}:${source}`}>
                {source}
              </span>
            ))
          ) : (
            <span className="product-source-badge muted">بدون منبع</span>
          )}
        </div>
      </td>

      {/* 3. Address Column */}
      <td className="col-url" onClick={(e) => e.stopPropagation()}>
        <div className="product-info-text">
          {product.is_public && !isAdmin ? (
            <span
              className="private-address-badge icon-only"
              title="آدرس منبع برای کالاهای عمومی بازار محرمانه است و توسط سیستم مدیریت می‌شود."
              aria-label="آدرس منبع محرمانه است"
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
          ) : product.primary_target ? (
            <a
              href={product.primary_target.url}
              target="_blank"
              rel="noopener noreferrer"
              className="product-url-link icon-only"
              aria-label={`مشاهده صفحه محصول در سایت مقصد`}
              title={`مشاهده صفحه محصول در سایت مقصد: ${product.primary_target.url}`}
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 4. Latest Price */}
      <td className="col-price">
        <div className="product-info-text">
          {product.latestSnapshot?.price_toman != null ? (
            <div className="catalog-table-price">
              <strong className="catalog-price-val">
                {formatNumber(product.latestSnapshot.price_toman)} تومان
              </strong>
              {product.latestSnapshot.price_usd != null ? (
                <span className="catalog-usd-val">
                  ({formatNumber(product.latestSnapshot.price_usd)} دلار)
                </span>
              ) : null}
            </div>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>

      {/* 5. Status Column (Interactive Switch for editable, Static Badge for read-only public) */}
      <td className="col-status" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <div className="status-toggle-wrapper">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-label={
                isActive
                  ? `غیرفعال کردن ${product.title}`
                  : `فعال کردن ${product.title}`
              }
              disabled={!canToggle || isToggling}
              className={`status-toggle-btn ${isActive ? "is-active" : "is-inactive"} ${
                isToggling ? "is-loading" : ""
              }`}
              onClick={onToggle}
              title={
                !canToggle
                  ? "بدون هدف فعال"
                  : isActive
                  ? "کلیک برای غیرفعال‌سازی (توقف جمع‌آوری قیمت)"
                  : "کلیک برای فعال‌سازی (از سرگیری استعلام قیمت)"
              }
            >
              <span className="status-toggle-thumb">
                {isToggling && (
                  <span className="status-toggle-spinner" aria-hidden="true" />
                )}
              </span>
            </button>
            <span className={`status-toggle-label ${isActive ? "active" : ""}`}>
              {isActive ? "فعال" : "غیرفعال"}
            </span>
          </div>
        ) : (
          <div className="status-readonly-wrapper">
            <span
              className={`status-static-badge ${isActive ? "active" : "inactive"}`}
              title={isActive ? "محصول در سیستم فعال است" : "محصول در سیستم غیرفعال است"}
            >
              <span className="status-dot" aria-hidden="true" />
              <span>{isActive ? "فعال" : "غیرفعال"}</span>
            </span>
          </div>
        )}
      </td>

      {/* 6. Last Check Observation Time */}
      <td className="col-date">
        <div className="product-info-text">
          {product.latestSnapshot?.observed_at ? (
            <span className="muted-text" title={product.latestSnapshot.observed_at}>
              {formatDate(product.latestSnapshot.observed_at)}
            </span>
          ) : (
            <span className="muted-text">-</span>
          )}
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
            </>
          ) : (
            <span className="muted-text">-</span>
          )}
        </div>
      </td>
    </tr>
  );
}
