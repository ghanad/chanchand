import React from "react";
import { Modal } from "@/components/common/Modal";
import { SourceRow } from "@/types/dashboard";
import { SourceFormState } from "./types";

interface EditSourceModalProps {
  source: SourceRow | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  form: SourceFormState;
  setForm: React.Dispatch<React.SetStateAction<SourceFormState>>;
  isBusy: boolean;
}

export function EditSourceModal({
  source,
  onClose,
  onSubmit,
  form,
  setForm,
  isBusy,
}: EditSourceModalProps) {
  return (
    <Modal
      isOpen={source !== null}
      onClose={onClose}
      title={`ویرایش منبع: ${source?.key || ""}`}
      maxWidth="600px"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-grid-2">
          <label>
            شناسه منبع (غیرقابل ویرایش)
            <input
              value={form.key}
              disabled
              dir="ltr"
              style={{ backgroundColor: "var(--surface-soft)", cursor: "not-allowed" }}
            />
          </label>
          <label>
            نوع آداپتور
            <select
              value={form.adapter}
              onChange={(e) => setForm((c) => ({ ...c, adapter: e.target.value }))}
            >
              <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
              <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
              <option value="servix_market">servix_market (وب‌سرویس طلا، سکه و ارز Servix)</option>
              <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
              <option value="iranjib">iranjib (قیمت خودرو و بازار ایران‌جیب)</option>
              <option value="generic_html">generic_html (خزش عمومی HTML)</option>
            </select>
          </label>
        </div>
        <div className="modal-grid-2">
          <label>
            فاصله بین درخواست‌ها (ثانیه)
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={form.rate_limit_seconds}
              onChange={(e) => setForm((c) => ({ ...c, rate_limit_seconds: Number(e.target.value) }))}
              required
            />
          </label>
          <label>
            مهلت زمانی (Timeout ثانیه)
            <input
              type="number"
              min="1"
              value={form.timeout_seconds}
              onChange={(e) => setForm((c) => ({ ...c, timeout_seconds: Number(e.target.value) }))}
              required
            />
          </label>
        </div>
        <div className="modal-grid-2">
          <label>
            واحد پول منبع
            <select
              value={form.currency}
              onChange={(e) => setForm((c) => ({ ...c, currency: e.target.value }))}
            >
              <option value="IRR">IRR (ریال)</option>
              <option value="TOMAN">TOMAN (تومان)</option>
            </select>
          </label>
          <label>
            ضریب تبدیل به ریال
            <input
              type="number"
              min="1"
              value={form.price_multiplier}
              onChange={(e) => setForm((c) => ({ ...c, price_multiplier: Number(e.target.value) }))}
              required
            />
          </label>
        </div>
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
