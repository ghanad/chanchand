import React from "react";
import Link from "next/link";
import { ProductRow, PriceRow } from "@/types/dashboard";
import { StatusPill } from "@/components/common/StatusPill";
import { availabilityText } from "@/lib/formatters";

interface ProductDetailHeaderProps {
  product: ProductRow;
  latestSnapshot: PriceRow | null;
  isAdmin: boolean;
  basePath: string;
  isActive: boolean;
  copiedUrl: boolean;
  isRunningNow: boolean;
  isToggling: boolean;
  onCopyUrl: () => void;
  onRunNow: () => void;
  onToggleActive: () => void;
  onOpenEdit: () => void;
  onOpenDelete: () => void;
}

export function ProductDetailHeader({
  product,
  latestSnapshot,
  isAdmin,
  basePath,
  isActive,
  copiedUrl,
  isRunningNow,
  isToggling,
  onCopyUrl,
  onRunNow,
  onToggleActive,
  onOpenEdit,
  onOpenDelete,
}: ProductDetailHeaderProps) {
  const canModify = isAdmin || Boolean(product.can_edit);
  const isIranjib =
    product.sources?.some((s) => s.toLowerCase().includes("iranjib")) ||
    Boolean(product.primary_target?.source_key?.toLowerCase().includes("iranjib")) ||
    Boolean(product.primary_target?.url?.toLowerCase().includes("iranjib.ir"));

  const displayUrl = React.useMemo(() => {
    if (!product.primary_target?.url) return "";
    try {
      return decodeURI(product.primary_target.url);
    } catch {
      return product.primary_target.url;
    }
  }, [product.primary_target?.url]);

  return (
    <>
      {/* Top Breadcrumb & Quick Navigation */}
      <div className="breadcrumb-bar">
        <Link href={`${basePath}/products`} className="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          بازگشت به لیست محصولات
        </Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{product.title}</span>
      </div>

      {/* Main Product Header Card */}
      <section className="panel product-detail-header-panel">
        <div className="product-detail-header-main">
          <div className="product-title-group">
            <div className="product-badges-row">
              <span className="product-slug-pill" title="شناسه یکتای محصول">
                {product.key}
              </span>
              {product.is_public ? (() => {
                const is24Hours =
                  product.key === "usd" ||
                  ((product.active_start_hour === 0 || product.active_start_hour === undefined || product.active_start_hour === null) &&
                    (product.active_end_hour === 23 || product.active_end_hour === undefined || product.active_end_hour === null)) ||
                  (product.active_start_hour === 0 && product.active_end_hour === 23);

                return (
                  <span
                    className="adapter-badge brsapi_market"
                    style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                    title={
                      is24Hours
                        ? "ساعات جمع‌آوری: ۲۴ ساعته (شبانه‌روزی)"
                        : `ساعات جمع‌آوری: ${String(product.active_start_hour ?? 0).padStart(2, "0")}:00 تا ${String(product.active_end_hour ?? 23).padStart(2, "0")}:00`
                    }
                  >
                    عمومی ({is24Hours ? "۲۴ ساعته" : `${String(product.active_start_hour ?? 0).padStart(2, "0")}:00 - ${String(product.active_end_hour ?? 23).padStart(2, "0")}:00`})
                  </span>
                );
              })() : null}
              {isAdmin && product.owner_username ? (
                <span className="adapter-badge generic_html" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                  کاربر: {product.owner_username}
                </span>
              ) : null}
              {product.sources.map((s) => (
                <span className="product-source-badge" key={s}>
                  {s}
                </span>
              ))}
              {latestSnapshot && (
                <StatusPill
                  text={availabilityText(latestSnapshot.availability)}
                  tone={latestSnapshot.availability}
                />
              )}
            </div>
            <h1 className="product-detail-title">{product.title}</h1>

            {isIranjib ? null : product.is_public && !isAdmin ? (
              <div
                className="product-url-wrapper product-detail-url muted-text"
                style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
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
                <span>آدرس اینترنتی این کالای عمومی برای کاربران عادی در دسترس نیست.</span>
              </div>
            ) : product.primary_target ? (
              <div className="product-url-wrapper product-detail-url">
                <button
                  type="button"
                  className="product-copy-btn"
                  onClick={onCopyUrl}
                  title={copiedUrl ? "کپی شد!" : "کپی لینک هدف"}
                  aria-label="کپی آدرس هدف"
                >
                  {copiedUrl ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                <a
                  href={product.primary_target.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="product-url-link"
                  dir="ltr"
                  title={product.primary_target.url}
                >
                  <span className="product-url-text">{displayUrl}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 6 }}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            ) : null}
          </div>

          {/* Action Buttons for Header */}
          <div className="product-detail-actions">
            {/* Re-fetch price button only for admin or product owner */}
            {canModify && (
              <button
                type="button"
                className="secondary-button"
                onClick={onRunNow}
                disabled={isRunningNow || !isActive || (!isAdmin && product.can_refresh === false)}
                title={
                  !isActive
                    ? "محصول غیرفعال است"
                    : !isAdmin && product.can_refresh === false
                    ? "امکان استعلام برای کاربران عادی فقط یک بار در روز است (استعلام امروز انجام شده)"
                    : "استعلام فوری و بروزرسانی قیمت همین محصول"
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {isRunningNow
                  ? "در حال دریافت قیمت..."
                  : !isAdmin && product.can_refresh === false
                  ? "استعلام امروز انجام شده"
                  : "استعلام قیمت این کالا"}
              </button>
            )}

            {/* Actions for owner or admin: Status toggle, Edit, Delete */}
            {canModify && (
              <>
                <div className="status-toggle-wrapper">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    disabled={isToggling || product.target_count === 0}
                    className={`status-toggle-btn ${isActive ? "is-active" : ""} ${isToggling ? "is-loading" : ""}`}
                    onClick={onToggleActive}
                    title={isActive ? "غیرفعال‌سازی رهگیری" : "فعال‌سازی رهگیری"}
                  >
                    <span className="status-toggle-thumb">
                      {isToggling && <span className="status-toggle-spinner" aria-hidden="true" />}
                    </span>
                  </button>
                  <span className={`status-toggle-label ${isActive ? "active" : ""}`}>
                    {isActive ? "رهگیری فعال" : "رهگیری غیرفعال"}
                  </span>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={onOpenEdit}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  ویرایش
                </button>

                <button
                  type="button"
                  className="danger-button-outline"
                  onClick={onOpenDelete}
                  title="حذف محصول"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
