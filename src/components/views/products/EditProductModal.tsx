import React from "react";
import { Modal } from "../../common/Modal";
import { ProductActiveHoursField } from "./ProductActiveHoursField";
import { SourceRow } from "../../../types/dashboard";
import { ProductFormState } from "./types";

interface EditProductModalProps {
  isOpen: boolean;
  productKey: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  editForm: ProductFormState;
  setEditForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  sources: SourceRow[];
  isAdmin: boolean;
  isBusy: boolean;
}

export function EditProductModal({
  isOpen,
  productKey,
  onClose,
  onSubmit,
  editForm,
  setEditForm,
  sources,
  isAdmin,
  isBusy,
}: EditProductModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`ویرایش محصول: ${editForm.title || productKey || ""}`}
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          عنوان محصول
          <input
            value={editForm.title}
            onChange={(event) =>
              setEditForm((current) => ({ ...current, title: event.target.value }))
            }
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        <label>
          منبع قیمت‌گیری
          <select
            value={editForm.source_key}
            onChange={(event) =>
              setEditForm((current) => ({ ...current, source_key: event.target.value }))
            }
          >
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.key} ({source.adapter})
              </option>
            ))}
          </select>
        </label>
        <label>
          آدرس اینترنتی (URL)
          <input
            value={editForm.url}
            onChange={(event) => {
              const val = event.target.value;
              setEditForm((current) => {
                let nextSource = current.source_key;
                if (val.includes("iranjib.ir") && sources.some((s) => s.key === "iranjib")) {
                  nextSource = "iranjib";
                } else if (val.includes("digikala.com") && sources.some((s) => s.key === "digikala_api")) {
                  nextSource = "digikala_api";
                }
                return { ...current, url: val, source_key: nextSource };
              });
            }}
            type="url"
            dir="ltr"
            placeholder="https://..."
            required
          />
        </label>
        {isAdmin ? (
          <>
            <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
              <input
                type="checkbox"
                checked={editForm.is_public}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, is_public: event.target.checked }))
                }
              />
              <span>محصول عمومی بازار (قابل مشاهده برای تمام کاربران)</span>
            </label>
            {editForm.is_public ? (
              <>
                <ProductActiveHoursField
                  startHour={editForm.active_start_hour}
                  endHour={editForm.active_end_hour}
                  onChangeStart={(hour) => setEditForm((current) => ({ ...current, active_start_hour: hour }))}
                  onChangeEnd={(hour) => setEditForm((current) => ({ ...current, active_end_hour: hour }))}
                />
                <label className="modal-checkbox-row" style={{ marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={editForm.show_usd_chart}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, show_usd_chart: event.target.checked }))
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
            {isBusy ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
