import React from "react";
import { Modal } from "@/components/common/Modal";
import { formatNumber } from "@/lib/formatters";
import { UserItem } from "./types";

interface ChargeWalletModalProps {
  user: UserItem | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  chargeOpType: "charge" | "deduct";
  setChargeOpType: (type: "charge" | "deduct") => void;
  chargeAmount: string;
  setChargeAmount: (amount: string) => void;
  chargeDescription: string;
  setChargeDescription: (desc: string) => void;
  isBusy: boolean;
}

export function ChargeWalletModal({
  user,
  onClose,
  onSubmit,
  chargeOpType,
  setChargeOpType,
  chargeAmount,
  setChargeAmount,
  chargeDescription,
  setChargeDescription,
  isBusy,
}: ChargeWalletModalProps) {
  if (!user) return null;

  const currentBalance = user.wallet_balance ?? 0;
  const numericAmt = Math.abs(parseInt(chargeAmount.replace(/\D/g, ""), 10) || 0);
  const signedAmt = chargeOpType === "charge" ? numericAmt : -numericAmt;
  const resultingBalance = currentBalance + signedAmt;

  return (
    <Modal
      isOpen={user !== null}
      onClose={onClose}
      title={`مدیریت کیف پول: ${user.username || ""}`}
      maxWidth="480px"
    >
      <form className="modal-form" onSubmit={onSubmit}>
        {/* خلاصه اطلاعات کاربر و موجودی */}
        <div className="wallet-modal-card">
          <div className="wallet-modal-user-row">
            <div className="wallet-modal-user-info">
              <span className="wallet-modal-avatar">
                {user.username[0]?.toUpperCase() || "U"}
              </span>
              <div className="wallet-modal-user-titles">
                <div className="wallet-modal-username">{user.username}</div>
                <span className="wallet-modal-subtext">
                  {user.email || user.mobile || "کاربر سامانه"}
                </span>
              </div>
            </div>
            <span className={`role-pill ${user.role}`}>
              {user.role === "admin" ? "مدیر کل" : "بیننده"}
            </span>
          </div>

          <div className="wallet-modal-stats-grid">
            <div className="wallet-stat-box">
              <span className="wallet-stat-label">موجودی فعلی</span>
              <span className="wallet-stat-value highlight">
                {formatNumber(currentBalance)} تومان
              </span>
            </div>
            <div className="wallet-stat-box">
              <span className="wallet-stat-label">ظرفیت اسلات‌ها</span>
              <span className="wallet-stat-value">
                {user.role === "admin"
                  ? "نامحدود"
                  : `${formatNumber(3 + (user.extra_slots ?? 0))} محصول`}
              </span>
            </div>
          </div>
        </div>

        {/* انتخاب نوع عملیات: افزایش / کاهش */}
        <div className="wallet-op-toggle" role="group" aria-label="نوع عملیات">
          <button
            type="button"
            className={`wallet-op-btn is-charge ${chargeOpType === "charge" ? "is-active" : ""}`}
            onClick={() => setChargeOpType("charge")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>افزایش اعتبار (شارژ)</span>
          </button>
          <button
            type="button"
            className={`wallet-op-btn is-deduct ${chargeOpType === "deduct" ? "is-active" : ""}`}
            onClick={() => setChargeOpType("deduct")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>کسر از موجودی</span>
          </button>
        </div>

        {/* ورودی مبلغ */}
        <label>
          <span>{chargeOpType === "charge" ? "مبلغ افزایش اعتبار" : "مبلغ کسر از موجودی"}</span>
          <div className="wallet-input-wrapper">
            <input
              type="text"
              inputMode="numeric"
              value={chargeAmount ? formatNumber(numericAmt) : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setChargeAmount(digits);
              }}
              placeholder="مثلاً: ۵۰,۰۰۰"
              required
              autoFocus
            />
            <span className="wallet-input-suffix">تومان</span>
          </div>
        </label>

        {/* دکمه‌های مبالغ سریع */}
        <div className="wallet-quick-pills" aria-label="مبالغ سریع">
          {[50000, 100000, 200000, 500000, 1000000].map((quickAmt) => (
            <button
              key={quickAmt}
              type="button"
              className={`wallet-quick-pill ${numericAmt === quickAmt ? "is-active" : ""}`}
              onClick={() => setChargeAmount(String(quickAmt))}
            >
              {chargeOpType === "charge" ? "+" : "-"}{formatNumber(quickAmt)} تومان
            </button>
          ))}
        </div>

        {/* پیش‌نمایش زنده موجودی جدید */}
        <div className={`wallet-result-preview ${resultingBalance < 0 ? "is-negative" : ""}`}>
          <span>موجودی جدید پس از اعمال:</span>
          <strong dir="ltr">{formatNumber(resultingBalance)} تومان</strong>
        </div>

        {resultingBalance < 0 && (
          <div className="wallet-negative-warning">
            ⚠️ توجه: با اعمال این کسر، موجودی حساب کاربر منفی خواهد شد.
          </div>
        )}

        {/* فیلد توضیحات */}
        <label>
          توضیحات تراکنش (اختیاری)
          <input
            type="text"
            value={chargeDescription}
            onChange={(e) => setChargeDescription(e.target.value)}
            placeholder="مثلاً: شارژ دستی از طریق کارت‌به‌کارت، تسویه، اصلاح موجودی..."
          />
        </label>

        {/* دکمه‌های فرم */}
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
            className={chargeOpType === "charge" ? "primary-button" : "danger-button"}
            type="submit"
            disabled={isBusy || numericAmt === 0}
          >
            {isBusy
              ? "در حال ثبت..."
              : chargeOpType === "charge"
              ? "تأیید و افزایش اعتبار"
              : "تأیید و کسر موجودی"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
