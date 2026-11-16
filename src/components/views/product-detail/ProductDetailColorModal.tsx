"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { requestJson } from "@/lib/api-client";
import { formatNumber } from "@/lib/formatters";

interface PreviewColor {
  id: string;
  label: string | null;
  hex: string | null;
  priceIrr: number | null;
  sellerCount: number;
  inStock: boolean;
}

interface ProductPreview {
  supported: boolean;
  title?: string | null;
  floor_price_irr?: number | null;
  floor_color_label?: string | null;
  in_stock?: boolean;
  colors?: PreviewColor[];
  error?: string;
}

interface ProductDetailColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productUrl: string;
  currentColorId: string | null;
  onConfirm: (colorId: string | null, colorLabel: string | null) => void;
  isSaving: boolean;
}

function toman(priceIrr: number | null | undefined): string {
  if (priceIrr === null || priceIrr === undefined) return "—";
  return `${formatNumber(Math.round(priceIrr / 10))} تومان`;
}

export function ProductDetailColorModal({
  isOpen,
  onClose,
  productUrl,
  currentColorId,
  onConfirm,
  isSaving,
}: ProductDetailColorModalProps) {
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(currentColorId);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(currentColorId);
    setError(null);
    setPreview(null);

    let cancelled = false;
    setIsLoading(true);
    requestJson<ProductPreview>(`/api/products/preview?url=${encodeURIComponent(productUrl)}`)
      .then((data) => {
        if (cancelled) return;
        if (!data || !data.supported) {
          setError("پیش‌نمایش این محصول در دسترس نیست.");
          return;
        }
        if (data.error) {
          setError(data.error);
          return;
        }
        setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات محصول");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, productUrl, currentColorId]);

  const colors = preview?.colors ?? [];
  const selectedColor = colors.find((color) => color.id === selected) ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="تغییر رنگ محصول">
      <div className="modal-form">
        {isLoading ? <p className="product-preview-hint">در حال دریافت رنگ‌ها…</p> : null}
        {error ? <p className="product-preview-hint product-preview-hint-error">{error}</p> : null}

        {preview ? (
          <>
            <p className="product-preview-note">
              رنگ بخشی از هویت محصول است: با تغییر رنگ، یک محصول جدید برای همان رنگ ساخته
              می‌شود و تاریخچهٔ رنگ قبلی حذف نمی‌شود؛ فقط از فهرست شما برداشته می‌شود.
            </p>
            <div className="product-preview-options">
              <button
                type="button"
                className={`product-preview-option ${selected === null ? "active" : ""}`}
                onClick={() => setSelected(null)}
              >
                <span className="product-preview-option-name">کف قیمت (هر رنگ)</span>
                <span className="product-preview-option-price">
                  {toman(preview.floor_price_irr)}
                </span>
              </button>

              {colors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  disabled={!color.inStock}
                  className={`product-preview-option ${selected === color.id ? "active" : ""}`}
                  onClick={() => setSelected(color.id)}
                >
                  <span className="product-preview-option-name">
                    <span
                      className="product-preview-color-dot"
                      style={{ background: color.hex || "var(--line)" }}
                    />
                    {color.label || "بدون رنگ"}
                  </span>
                  <span className="product-preview-option-price">
                    {color.inStock ? toman(color.priceIrr) : "ناموجود"}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <div className="modal-form-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>
            انصراف
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isSaving || isLoading || !preview || selected === currentColorId}
            onClick={() => onConfirm(selected, selectedColor?.label ?? null)}
          >
            {isSaving ? "در حال تغییر..." : "تغییر رنگ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
