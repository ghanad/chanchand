import React from "react";
import { SourceRow } from "@/types/dashboard";
import { Modal } from "@/components/common/Modal";
import { ProductDetailEditForm } from "./types";

interface ProductDetailEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  productTitle: string;
  form: ProductDetailEditForm;
  setForm: React.Dispatch<React.SetStateAction<ProductDetailEditForm>>;
  configuredSources: SourceRow[];
  isAdmin: boolean;
  isSaving: boolean;
}

export function ProductDetailEditModal({
  isOpen,
  onClose,
  onSubmit,
  productTitle,
  form,
  setForm,
  configuredSources,
  isAdmin,
  isSaving,
}: ProductDetailEditModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`ویرایش محصول: ${productTitle}`}
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          عنوان محصول
          <input
            value={form.title}
            onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
            required
            autoFocus
          />
        </label>
        <label>
          منبع قیمت‌گیری
          <select
            value={form.source_key}
            onChange={(e) => setForm((c) => ({ ...c, source_key: e.target.value }))}
          >
            {configuredSources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.key} ({source.adapter})
              </option>
            ))}
          </select>
        </label>
        <label>
          آدرس اینترنتی (URL)
          <input
            value={form.url}
            onChange={(e) => setForm((c) => ({ ...c, url: e.target.value }))}
            type="url"
            dir="ltr"
            required
          />
        </label>
        {isAdmin ? (
          <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm((c) => ({ ...c, is_public: e.target.checked }))}
            />
            <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
          </label>
        ) : null}
        <div className="modal-form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={isSaving}
          >
            انصراف
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={isSaving}
          >
            {isSaving ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
