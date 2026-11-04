import React from "react";
import { formatNumber } from "@/lib/formatters";

interface WalletDirectSlotPanelProps {
  slotPrice: number;
  canAffordSlot: boolean;
  deficit: number;
  buyingSlot: boolean;
  onBuySlot: () => void;
}

export function WalletDirectSlotPanel({
  slotPrice,
  canAffordSlot,
  deficit,
  buyingSlot,
  onBuySlot,
}: WalletDirectSlotPanelProps) {
  return (
    <div className="wallet-direct-slot-panel">
      <div className="wallet-direct-slot-info">
        <div className="wallet-direct-slot-icon" aria-hidden="true">
          ⚡
        </div>
        <div className="wallet-direct-slot-text">
          <h4>شارژ ماهانه ۱ اسلات پایش با کسر از موجودی کیف پول</h4>
          <p>
            تعرفه شارژ ماهانه هر اسلات (۳۰ روزه): <strong>{formatNumber(slotPrice)} تومان</strong>
            {canAffordSlot ? (
              <span style={{ color: "var(--ok)", marginInlineStart: "8px" }}>
                (موجودی شما کافی است)
              </span>
            ) : (
              <span style={{ color: "var(--danger)", marginInlineStart: "8px" }}>
                (کسری موجودی: {formatNumber(deficit)} تومان)
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="wallet-direct-slot-actions">
        <button
          type="button"
          disabled={!canAffordSlot || buyingSlot}
          onClick={onBuySlot}
          className="btn btn-primary btn-sm"
        >
          {buyingSlot ? (
            <span>در حال ثبت...</span>
          ) : canAffordSlot ? (
            <span>شارژ ۱ اسلات ماهانه ({formatNumber(slotPrice)} تومان)</span>
          ) : (
            <span>موجودی ناکافی است</span>
          )}
        </button>
      </div>
    </div>
  );
}
