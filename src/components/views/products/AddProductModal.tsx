import React from "react";
import { Modal } from "../../common/Modal";
import { ProductActiveHoursField } from "./ProductActiveHoursField";
import { SourceRow } from "../../../types/dashboard";
import { ProductFormState } from "./types";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  sources: SourceRow[];
  isAdmin: boolean;
  isBusy: boolean;
}

export function AddProductModal({
  isOpen,
  onClose,
  onSubmit,
  form,
  setForm,
  sources,
  isAdmin,
  isBusy,
}: AddProductModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="افزودن محصول جدید"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          عنوان محصول
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="مثلاً: تلویزیون ۵۵ اینچ سامسونگ"
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        <label>
          آدرس اینترنتی (URL)
          <input
            value={form.url}
            onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
            placeholder="https://..."
            type="url"
            dir="ltr"
            required
          />
        </label>
        <label>
          منبع قیمت‌گیری
          <select
            value={form.source_key}
            onChange={(event) => setForm((current) => ({ ...current, source_key: event.target.value }))}
          >
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.key} ({source.adapter})
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <>
            <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(event) => setForm((current) => ({ ...current, is_public: event.target.checked }))}
              />
              <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
            </label>
            {form.is_public ? (
              <>
                <ProductActiveHoursField
                  startHour={form.active_start_hour}
                  endHour={form.active_end_hour}
                  onChangeStart={(hour) => setForm((current) => ({ ...current, active_start_hour: hour }))}
                  onChangeEnd={(hour) => setForm((current) => ({ ...current, active_end_hour: hour }))}
                />
                <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={form.show_usd_chart}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, show_usd_chart: event.target.checked }))
                    }
                  />
                  <span>نمایش نمودار دلاری برای این کالا</span>
                </label>
              </>
            ) : null}
          </>
        ) : null}
        <div className="modal-form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={isBusy}
          >
            انصراف
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "در حال افزودن..." : "افزودن محصول"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
