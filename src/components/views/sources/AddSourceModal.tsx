import React from "react";
import { Modal } from "@/components/common/Modal";
import { SourceFormState } from "./types";

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  form: SourceFormState;
  setForm: React.Dispatch<React.SetStateAction<SourceFormState>>;
  isBusy: boolean;
}

export function AddSourceModal({
  isOpen,
  onClose,
  onSubmit,
  form,
  setForm,
  isBusy,
}: AddSourceModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="افزودن منبع قیمت‌گیری جدید"
      maxWidth="600px"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-grid-2">
          <label>
            شناسه منبع (Key)
            <input
              value={form.key}
              onChange={(e) => setForm((c) => ({ ...c, key: e.target.value }))}
              placeholder="مثلاً: digikala_app"
              dir="ltr"
              required
              autoFocus
            />
            <span className="form-hint">نام انگلیسی یکتا برای شناسایی منبع در سیستم</span>
          </label>
          <label>
            نوع آداپتور
            <select
              value={form.adapter}
              onChange={(e) => {
                const val = e.target.value;
                setForm((c) => ({
                  ...c,
                  adapter: val,
                  currency: val === "brsapi_market" ? "TOMAN" : c.currency,
                  price_multiplier: val === "brsapi_market" ? 10 : c.price_multiplier,
                }));
              }}
            >
              <option value="digikala_api">digikala_api (وب‌سرویس دیجی‌کالا)</option>
              <option value="digikala_web">digikala_web (خزش وب دیجی‌کالا)</option>
              <option value="servix_market">servix_market (وب‌سرویس طلا، سکه و ارز Servix)</option>
              <option value="brsapi_market">brsapi_market (وب‌سرویس طلا و ارز)</option>
              <option value="generic_html">generic_html (خزش عمومی HTML)</option>
            </select>
            <span className="form-hint">موتور دریافت قیمت (در صورت نیاز به آداپتور اختصاصی جدید، به راهنمای پایین صفحه مراجعه کنید)</span>
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
            <span className="form-hint">وقفه بین درخواست‌های متوالی برای جلوگیری از مسدودی</span>
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
            <span className="form-hint">حداکثر زمان انتظار برای دریافت پاسخ از سرور</span>
          </label>
        </div>
        <div className="modal-grid-2">
          <label>
            واحد پول منبع
            <select
              value={form.currency}
              onChange={(e) => {
                const curr = e.target.value;
                setForm((c) => ({
                  ...c,
                  currency: curr,
                  price_multiplier: curr === "TOMAN" ? 10 : 1,
                }));
              }}
            >
              <option value="IRR">IRR (ریال)</option>
              <option value="TOMAN">TOMAN (تومان)</option>
            </select>
            <span className="form-hint">واحد پولی که قیمت با آن از سایت دریافت می‌شود</span>
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
            <span className="form-hint">برای ریال عدد ۱ و برای تومان عدد ۱۰ وارد شود</span>
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
            {isBusy ? "در حال ثبت..." : "افزودن منبع"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
