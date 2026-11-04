import React from "react";
import { ProductItemWithPrice } from "./types";

interface ProductStatusSwitchProps {
  product: ProductItemWithPrice;
  canEdit: boolean;
  isActive: boolean;
  canToggle: boolean;
  isToggling?: boolean;
  onToggle: () => void;
}

export function ProductStatusSwitch({
  product,
  canEdit,
  isActive,
  canToggle,
  isToggling = false,
  onToggle,
}: ProductStatusSwitchProps) {
  if (canEdit) {
    return (
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
    );
  }

  return (
    <div className="status-readonly-wrapper">
      <span
        className={`status-static-badge ${isActive ? "active" : "inactive"}`}
        title={isActive ? "محصول در سیستم فعال است" : "محصول در سیستم غیرفعال است"}
      >
        <span className="status-dot" aria-hidden="true" />
        <span>{isActive ? "فعال" : "غیرفعال"}</span>
      </span>
    </div>
  );
}
