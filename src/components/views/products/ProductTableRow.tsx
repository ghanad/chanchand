import React from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "@/components/common/DateTime";
import { ProductTableRowProps } from "./types";
import { ProductStatusSwitch } from "./ProductStatusSwitch";
import { ProductKebabMenu } from "./ProductKebabMenu";
import { ProductTitleCell } from "./ProductTitleCell";
import { ProductUrlCell } from "./ProductUrlCell";
import { ProductPriceCell } from "./ProductPriceCell";

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
      <ProductTitleCell
        product={product}
        detailUrl={detailUrl}
        showPublicIndicator={showPublicIndicator}
      />

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
      <ProductUrlCell
        product={product}
        isAdmin={isAdmin}
        copiedKey={copiedKey}
        onCopyUrl={onCopyUrl}
      />

      {/* 4. Price Column */}
      <ProductPriceCell latestSnapshot={product.latestSnapshot} />

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
